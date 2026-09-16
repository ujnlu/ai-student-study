/**
 * 同步练习：按"学校学到哪一课"出题。
 * 题目来自题库（Problem.source = "bank"，挂在章节上）；题库不够时用 AI 结合教材原文补充。
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveAssistant, runJson } from "@/lib/ai";
import { gradeText, renderTemplate } from "@/lib/ai/prompts";
import { withTextbookContext } from "@/lib/textbook-context";

import { SUBJECT_NAME } from "@/lib/subjects";
const SET_SIZE = 8;
const BANK_BATCH = 12;

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

/** 孩子某学科当前的教材（当前学期优先） */
export async function currentTextbook(childId: string, subjectId: string) {
  const child = await db.child.findUniqueOrThrow({ where: { id: childId }, include: { textbooks: true } });
  const ct = child.textbooks.find((t) => t.subjectId === subjectId);
  if (!ct) return null;
  const books = await db.textbook.findMany({
    where: { textbookVersionId: ct.textbookVersionId, grade: child.grade, status: "ready" },
    include: { chapters: { orderBy: { sortOrder: "asc" } } },
  });
  return books.find((b) => b.semester === child.semester) ?? books[0] ?? null;
}

/** 可作为"当前课"的章节：有页码的叶子节点 */
export function lessonChapters(chapters: { id: string; parentId: string | null; pageStart: number | null; title: string; level: number; sortOrder: number }[]) {
  const hasChild = new Set(chapters.filter((c) => c.parentId).map((c) => c.parentId!));
  return chapters.filter((c) => c.pageStart && !hasChild.has(c.id) && !/整理和复习|总复习|数学游戏|学习准备/.test(c.title));
}

/** 当前学到的章节；没设置过就取本册第一课 */
export async function currentChapter(childId: string, subjectId: string) {
  const p = await db.childProgress.findUnique({ where: { childId_subjectId: { childId, subjectId } }, include: { chapter: { include: { textbook: true } } } });
  if (p) return p.chapter;
  const tb = await currentTextbook(childId, subjectId);
  if (!tb) return null;
  const first = lessonChapters(tb.chapters)[0];
  if (!first) return null;
  return { ...first, textbook: tb };
}

export async function setProgress(childId: string, subjectId: string, chapterId: string) {
  return db.childProgress.upsert({
    where: { childId_subjectId: { childId, subjectId } },
    create: { childId, subjectId, chapterId },
    update: { chapterId },
  });
}

/** 章节的完整标题路径，如 "二、1~6的表内乘法 › 乘加、乘减" */
export async function chapterPath(chapterId: string) {
  const parts: string[] = [];
  let cur = await db.textbookChapter.findUnique({ where: { id: chapterId } });
  while (cur) {
    parts.unshift(cur.title);
    cur = cur.parentId ? await db.textbookChapter.findUnique({ where: { id: cur.parentId } }) : null;
  }
  return parts.join(" › ");
}

/** 题库不足时补题：用教材原文让 AI 出题，存为 bank */
async function fillBank(childId: string, chapterId: string, need: number) {
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
            `课时：${path}\n请围绕这一课的例题和"做一做"，出 ${need} 道同步练习题，难度从易到难（1-3），题型仿照教材（口算、填空、看图列式、简单应用题）。` +
            `其中 2 题按新课标"新题新考法"出：有真实生活情境的应用性题或跨学科（科学 / 生活）情境题，但答案仍然唯一。` +
            `answer 只写最终答案。不要与下面这些已有题目重复：\n${existing.map((e) => "- " + e.stem).join("\n")}`,
        },
      ],
    },
    Bank,
  );
  // 课时对应的知识点：优先同名；没有就按课时标题新建一个，避免挂到模糊匹配来的别的知识点上
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

/** 生成一组同步练习（当前课），优先用孩子没做过的题库题 */
export async function createSyncSet(childId: string, subjectId: string, size = SET_SIZE) {
  const chapter = await currentChapter(childId, subjectId);
  if (!chapter) throw new Error("还没有导入这个学科的教材，请先在家长端「教材」页导入");
  const done = await db.attempt.findMany({ where: { childId, problem: { chapterId: chapter.id, source: "bank" } }, select: { problemId: true } });
  const doneIds = new Set(done.map((d) => d.problemId));
  let pool = (await db.problem.findMany({ where: { chapterId: chapter.id, source: "bank" } })).filter((p) => !doneIds.has(p.id));
  if (pool.length < size) {
    await fillBank(childId, chapter.id, Math.max(BANK_BATCH, size - pool.length));
    pool = (await db.problem.findMany({ where: { chapterId: chapter.id, source: "bank" } })).filter((p) => !doneIds.has(p.id));
  }
  // 按难度排序后取前 size 题，保证从易到难
  pool.sort((a, b) => a.difficulty - b.difficulty || Math.random() - 0.5);
  const picked = pool.slice(0, size);
  if (picked.length === 0) throw new Error("题库为空");
  const path = await chapterPath(chapter.id);
  const set = await db.practiceSet.create({
    data: { childId, kind: "sync", title: `同步练：${path.split(" › ").pop()}`, status: "ready", chapterId: chapter.id, total: picked.length },
  });
  for (let i = 0; i < picked.length; i++) await db.practiceItem.create({ data: { setId: set.id, index: i, problemId: picked[i].id } });
  return set;
}
