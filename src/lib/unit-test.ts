/**
 * 单元测试：按孩子当前所在的单元，从题库里挑各课时的题组成一份 15 题 / 20 分钟的小测。
 * 题库不够时用 AI 结合教材原文补题（与同步练共用 bank 题库）。
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveAssistant, runJson } from "@/lib/ai";
import { gradeText, renderTemplate } from "@/lib/ai/prompts";
import { withTextbookContext } from "@/lib/textbook-context";
import { chapterPath, currentChapter, lessonChapters } from "@/lib/sync";

const SUBJECT_NAME: Record<string, string> = { math: "数学", chinese: "语文", english: "英语" };
export const UNIT_TEST_SIZE = 15;
export const UNIT_TEST_SECONDS = 20 * 60;
const FILL_PER_LESSON = 8;
const MAX_FILL_LESSONS = 3;

const Bank = z.object({
  problems: z.array(
    z.object({
      stem: z.string(),
      answer: z.string(),
      solution: z.string(),
      difficulty: z.number().int().min(1).max(5),
      knowledgePoint: z.string().describe("知识点名称"),
    }),
  ),
});

type Chapter = { id: string; parentId: string | null; pageStart: number | null; title: string; level: number; sortOrder: number };

/** 某章节所在的顶层单元 + 该单元下的所有课时（有页码的叶子，去掉整理和复习） */
async function unitOf(chapter: { id: string; textbook: { id: string } }) {
  const all: Chapter[] = await db.textbookChapter.findMany({ where: { textbookId: chapter.textbook.id }, orderBy: { sortOrder: "asc" } });
  const byId = new Map(all.map((c) => [c.id, c]));
  let unit = byId.get(chapter.id);
  if (!unit) return null;
  while (unit.parentId && byId.has(unit.parentId)) unit = byId.get(unit.parentId)!;
  // 单元的全部后代
  const desc: Chapter[] = [];
  const stack = [unit.id];
  while (stack.length) {
    const pid = stack.pop()!;
    for (const c of all) if (c.parentId === pid) { desc.push(c); stack.push(c.id); }
  }
  const lessons = lessonChapters(desc.length ? desc : [unit]);
  return { unit, lessons };
}

async function unattemptedBank(childId: string, lessonIds: string[]) {
  const done = await db.attempt.findMany({ where: { childId, problem: { chapterId: { in: lessonIds }, source: "bank" } }, select: { problemId: true } });
  const doneIds = new Set(done.map((d) => d.problemId));
  const pool = await db.problem.findMany({ where: { chapterId: { in: lessonIds }, source: "bank" } });
  return pool.filter((p) => !doneIds.has(p.id));
}

/** 题库不足时补题：用教材原文让 AI 出题，存为 bank（与 sync.ts 的 fillBank 逻辑一致） */
export async function fillLessonBank(childId: string, chapterId: string, need = FILL_PER_LESSON) {
  const chapter = await db.textbookChapter.findUniqueOrThrow({ where: { id: chapterId }, include: { textbook: true, knowledgePoints: true } });
  const child = await db.child.findUniqueOrThrow({ where: { id: childId } });
  const subjectId = chapter.textbook.subjectId;
  const assistant = await resolveAssistant(child.familyId, "generate");
  const pages = await db.textbookPage.findMany({
    where: { textbookId: chapter.textbookId, pageNo: { gte: chapter.pageStart ?? 1, lte: chapter.pageEnd ?? chapter.pageStart ?? 1 } },
    orderBy: { pageNo: "asc" },
  });
  const excerpt = pages.map((p) => p.text).filter((t) => t.trim()).join("\n").slice(0, 3000);
  const path = await chapterPath(chapterId);
  const system = withTextbookContext(
    renderTemplate(assistant.systemPrompt, {
      childName: child.name,
      grade: child.grade,
      gradeText: gradeText(child.grade),
      semester: child.semester === 1 ? "上学期" : "下学期",
      subject: SUBJECT_NAME[subjectId] ?? "全科",
      textbook: chapter.textbook.title,
      region: child.region,
    }),
    excerpt ? { text: `《${chapter.textbook.title}》· ${path}\n${excerpt}` } : null,
  );
  const existing = await db.problem.findMany({ where: { chapterId, source: "bank" }, select: { stem: true }, take: 60 });
  const r = await runJson(
    assistant,
    {
      system,
      messages: [
        {
          role: "user",
          content:
            `课时：${path}\n请围绕这一课的例题和"做一做"，出 ${need} 道单元测试题，难度从易到难（1-3），题型仿照教材（口算、填空、看图列式、简单应用题）。` +
            `answer 只写最终答案。不要与下面这些已有题目重复：\n${existing.map((e) => "- " + e.stem).join("\n")}`,
        },
      ],
    },
    Bank,
  );
  // 课时对应的知识点：优先同名；没有就按课时标题新建一个
  const kps = chapter.knowledgePoints;
  const norm = (s: string) => s.replace(/[\s、，,：:（）()～~\-—·.]/g, "");
  let lessonKp = kps.find((k) => norm(k.name) === norm(chapter.title)) ?? null;
  if (!lessonKp) {
    const unit = path.split(" › ")[0] ?? chapter.title;
    const max = await db.knowledgePoint.aggregate({ where: { textbookVersionId: chapter.textbook.textbookVersionId }, _max: { sortOrder: true } });
    lessonKp = await db.knowledgePoint.create({
      data: {
        subjectId,
        textbookVersionId: chapter.textbook.textbookVersionId,
        grade: chapter.textbook.grade,
        semester: chapter.textbook.semester,
        unit,
        name: chapter.title,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
        chapterId: chapter.id,
      },
    });
  }
  const rows = [];
  for (const q of r.data.problems) {
    const kp = kps.find((k) => k.name === q.knowledgePoint) ?? lessonKp;
    rows.push(
      await db.problem.create({
        data: { subjectId, chapterId, knowledgePointId: kp?.id ?? null, stem: q.stem, answer: q.answer, solution: q.solution, difficulty: q.difficulty, source: "bank" },
      }),
    );
  }
  return rows;
}

/** 单元介绍页用：单元名、课时数、题库题数 */
export async function unitInfo(childId: string, subjectId = "math") {
  const chapter = await currentChapter(childId, subjectId);
  if (!chapter) return null;
  const u = await unitOf(chapter);
  if (!u) return null;
  const bankCount = await db.problem.count({ where: { chapterId: { in: u.lessons.map((l) => l.id) }, source: "bank" } });
  return { unitId: u.unit.id, unitTitle: u.unit.title, lessonCount: u.lessons.length, bankCount };
}

/** 生成一份单元测：各课时轮流取题，从易到难 */
export async function createUnitTest(childId: string, subjectId = "math", size = UNIT_TEST_SIZE) {
  const chapter = await currentChapter(childId, subjectId);
  if (!chapter) throw new Error("还没有导入这个学科的教材，请先在家长端「教材」页导入");
  const u = await unitOf(chapter);
  if (!u || u.lessons.length === 0) throw new Error("这个单元还没有可以出题的课时");
  const { unit, lessons } = u;
  const lessonIds = lessons.map((l) => l.id);

  let pool = await unattemptedBank(childId, lessonIds);
  if (pool.length < size) {
    // 题最少的课时优先补题，补够就停
    const counts = new Map(lessonIds.map((id) => [id, 0]));
    for (const p of pool) counts.set(p.chapterId!, (counts.get(p.chapterId!) ?? 0) + 1);
    const fewest = [...lessons].sort((a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0)).slice(0, MAX_FILL_LESSONS);
    for (const l of fewest) {
      await fillLessonBank(childId, l.id, FILL_PER_LESSON);
      pool = await unattemptedBank(childId, lessonIds);
      if (pool.length >= size) break;
    }
  }
  if (pool.length === 0) throw new Error("题库为空");

  // 各课时轮流取题（课时内随机），再整体按难度从易到难
  const groups = lessonIds.map((id) => pool.filter((p) => p.chapterId === id).sort(() => Math.random() - 0.5)).filter((g) => g.length > 0);
  const picked: typeof pool = [];
  for (let round = 0; picked.length < size; round++) {
    let any = false;
    for (const g of groups) {
      if (picked.length >= size) break;
      if (round < g.length) { picked.push(g[round]); any = true; }
    }
    if (!any) break;
  }
  const order = new Map(picked.map((p, i) => [p.id, i]));
  picked.sort((a, b) => a.difficulty - b.difficulty || order.get(a.id)! - order.get(b.id)!);

  const set = await db.practiceSet.create({
    data: { childId, kind: "unit", title: `单元测：${unit.title}`, status: "ready", chapterId: unit.id, timeLimitSec: UNIT_TEST_SECONDS, total: picked.length },
  });
  for (let i = 0; i < picked.length; i++) await db.practiceItem.create({ data: { setId: set.id, index: i, problemId: picked[i].id } });
  return set;
}

/** 已完成单元测的分课时成绩 */
export async function unitReport(setId: string) {
  const set = await db.practiceSet.findUniqueOrThrow({
    where: { id: setId },
    include: { items: { include: { problem: { include: { chapter: true } } }, orderBy: { index: "asc" } } },
  });
  const rows = new Map<string, { chapterId: string | null; title: string; correct: number; total: number; sortOrder: number }>();
  for (const it of set.items) {
    const ch = it.problem.chapter;
    const key = ch?.id ?? "-";
    const row = rows.get(key) ?? { chapterId: ch?.id ?? null, title: ch?.title ?? "其他", correct: 0, total: 0, sortOrder: ch?.sortOrder ?? 1e9 };
    row.total++;
    if (it.isCorrect) row.correct++;
    rows.set(key, row);
  }
  return {
    setId: set.id,
    title: set.title,
    status: set.status,
    score: set.score,
    total: set.total,
    lessons: [...rows.values()].sort((a, b) => a.sortOrder - b.sortOrder).map(({ chapterId, title, correct, total }) => ({ chapterId, title, correct, total })),
  };
}
