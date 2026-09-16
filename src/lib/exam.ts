/**
 * 真题演练：
 *  - 孩子：期中 / 期末模拟卷，从本册学到当前课为止的各课时题库抽题（题库不够时给最少的课时补题），限时。
 *  - 家长：按考试科目出整套"仿真真题"（AI 一次生成一套，存为 topic = exam-<subject>），优先取没做过的。
 * 做完后每题可看解题讲解（walkthrough）。
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveAssistant, runJson } from "@/lib/ai";
import { currentChapter, currentTextbook, lessonChapters } from "@/lib/sync";
import { fillLessonBank } from "@/lib/unit-test";
import { ADULT_EXAMS, adultSystemPrompt, type AdultSubject } from "@/lib/topics";
import { gradeText, renderTemplate } from "@/lib/ai/prompts";
import { SECONDARY_SUBJECT_NAME, STAGE_EXAM_NAME, STAGE_EXAMS, type ExamStage, type SecondarySubject } from "@/lib/secondary-catalog";

export const EXAM_SIZE = 20;
export const EXAM_SECONDS = 30 * 60;

/** 孩子模拟卷：scope = mid 期中（前一半单元）| final 期末（全册到当前课） */
export async function createMockExam(childId: string, subjectId: string, scope: "mid" | "final") {
  const tb = await currentTextbook(childId, subjectId);
  const cur = await currentChapter(childId, subjectId);
  if (!tb || !cur) throw new Error("还没有导入这个学科的教材");
  const lessons = lessonChapters(tb.chapters);
  const idx = Math.max(0, lessons.findIndex((l) => l.id === cur.id));
  const learned = lessons.slice(0, idx + 1);
  const scoped = scope === "mid" ? learned.slice(0, Math.max(1, Math.ceil(learned.length / 2))) : learned;
  const ids = scoped.map((l) => l.id);
  const done = new Set((await db.attempt.findMany({ where: { childId, problem: { chapterId: { in: ids }, source: "bank" } }, select: { problemId: true } })).map((a) => a.problemId));
  const load = async () => (await db.problem.findMany({ where: { chapterId: { in: ids }, source: "bank" } })).filter((p) => !done.has(p.id));
  let pool = await load();
  if (pool.length < EXAM_SIZE) {
    const counts = new Map(ids.map((id) => [id, 0]));
    for (const p of pool) counts.set(p.chapterId!, (counts.get(p.chapterId!) ?? 0) + 1);
    const fewest = [...scoped].sort((a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0)).slice(0, 3);
    for (const l of fewest) {
      await fillLessonBank(childId, l.id, 8);
      pool = await load();
      if (pool.length >= EXAM_SIZE) break;
    }
  }
  if (pool.length === 0) throw new Error("题库为空");
  // 各课时轮流取，再按难度排序
  const groups = ids.map((id) => pool.filter((p) => p.chapterId === id).sort(() => Math.random() - 0.5)).filter((g) => g.length);
  const picked: typeof pool = [];
  for (let round = 0; picked.length < EXAM_SIZE; round++) {
    let any = false;
    for (const g of groups) {
      if (picked.length >= EXAM_SIZE) break;
      if (round < g.length) {
        picked.push(g[round]);
        any = true;
      }
    }
    if (!any) break;
  }
  picked.sort((a, b) => a.difficulty - b.difficulty);
  const name = scope === "mid" ? "期中模拟卷" : "期末模拟卷";
  const set = await db.practiceSet.create({ data: { childId, kind: "exam", title: `${name}：${tb.title.replace(/.*教科书[·•]?\s*/, "")}`, status: "ready", chapterId: cur.id, timeLimitSec: EXAM_SECONDS, total: picked.length } });
  for (let i = 0; i < picked.length; i++) await db.practiceItem.create({ data: { setId: set.id, index: i, problemId: picked[i].id } });
  return set;
}

const Paper = z.object({ problems: z.array(z.object({ module: z.string(), stem: z.string(), answer: z.string(), solution: z.string(), difficulty: z.number().int().min(1).max(5) })) });

export const adultExamCode = (subject: AdultSubject) => `exam-${subject}`;

/** 家长真题演练：一套仿真卷 */
export async function createAdultExam(childId: string, subject: AdultSubject) {
  const exam = ADULT_EXAMS[subject];
  if (!exam) throw new Error("没有这个考试");
  const child = await db.child.findUniqueOrThrow({ where: { id: childId } });
  const code = adultExamCode(subject);
  const done = new Set((await db.attempt.findMany({ where: { childId, problem: { topic: code } }, select: { problemId: true } })).map((a) => a.problemId));
  const load = async () => (await db.problem.findMany({ where: { topic: code, source: "bank" } })).filter((p) => !done.has(p.id));
  let pool = await load();
  if (pool.length < exam.examSize) {
    const assistant = await resolveAssistant(child.familyId, "generate");
    const existing = (await db.problem.findMany({ where: { topic: code }, select: { stem: true }, take: 40 })).map((p) => "- " + p.stem.slice(0, 40)).join("\n");
    // 分模块分批出题，每批不超过 10 题，避免超出模型单次输出上限
    for (const [part, count] of exam.parts) {
      const r = await runJson(
        assistant,
        {
          system: `${adultSystemPrompt(subject)}\n请出一套仿真真题中的一个部分：${exam.examHint}。全部为单项选择题（题干最后另起行列出 A. B. C. D.，answer 只写字母），module 写模块名，solution 写解析要点（不超过 60 字），difficulty 1-5。听力题按 🔊{{英文}} 格式。题目要原创，不要照抄真实试卷。`,
          messages: [{ role: "user", content: `本批只出「${part}」共 ${count} 题。不要与这些已有题目重复：\n${existing || "（无）"}` }],
        },
        Paper,
      );
      for (const q of r.data.problems.slice(0, count + 2)) {
        if (!q.stem.trim() || !q.answer.trim()) continue;
        await db.problem.create({ data: { topic: code, stem: q.stem.trim(), answer: q.answer.trim(), solution: `【${q.module}】${q.solution}`, difficulty: q.difficulty, source: "bank" } });
      }
    }
    pool = await load();
  }
  if (pool.length === 0) throw new Error("题库为空，再试一次");
  const picked = pool.sort(() => Math.random() - 0.5).slice(0, exam.examSize);
  const set = await db.practiceSet.create({ data: { childId, kind: "exam", title: `真题演练：${exam.name}`, status: "ready", topic: code, timeLimitSec: exam.examMinutes * 60, total: picked.length } });
  for (let i = 0; i < picked.length; i++) await db.practiceItem.create({ data: { setId: set.id, index: i, problemId: picked[i].id } });
  return set;
}

export const stageExamCode = (stage: ExamStage, subject: SecondarySubject) => `exam-${stage}-${subject}`;

/** 中考 / 高考模拟卷：按试卷结构分批出题（原创真题风格），优先取没做过的 */
export async function createStageExam(childId: string, stage: ExamStage, subject: SecondarySubject) {
  const cfg = STAGE_EXAMS[stage][subject];
  if (!cfg) throw new Error("这个科目还没有模拟卷");
  const child = await db.child.findUniqueOrThrow({ where: { id: childId } });
  const code = stageExamCode(stage, subject);
  const size = cfg.parts.reduce((a, [, n]) => a + n, 0);
  const done = new Set((await db.attempt.findMany({ where: { childId, problem: { topic: code } }, select: { problemId: true } })).map((a) => a.problemId));
  const load = async () => (await db.problem.findMany({ where: { topic: code, source: "bank" } })).filter((p) => !done.has(p.id));
  let pool = await load();
  if (pool.length < size) {
    const assistant = await resolveAssistant(child.familyId, "generate");
    const existing = (await db.problem.findMany({ where: { topic: code }, select: { stem: true }, take: 40 })).map((p) => "- " + p.stem.slice(0, 40)).join("\n");
    const base = renderTemplate(assistant.systemPrompt, { childName: child.name, grade: child.grade, gradeText: gradeText(child.grade), semester: child.semester === 1 ? "上学期" : "下学期", subject: SECONDARY_SUBJECT_NAME[subject], textbook: "人教版 / 新课标", region: child.region });
    for (const [part, count] of cfg.parts) {
      const r = await runJson(
        assistant,
        {
          system: `${base}\n\n请出一套${STAGE_EXAM_NAME[stage]}${SECONDARY_SUBJECT_NAME[subject]}模拟卷中的一个部分，题型难度表述贴近真实${STAGE_EXAM_NAME[stage]}试卷（原创，不抄真实试卷）。全部为客观题：单项选择题（题干最后另起行列出 A. B. C. D.，answer 只写字母）或答案唯一的填空题（answer 只写最终结果）。module 写题型名，solution 写解析要点（不超过 80 字），difficulty 1-5。听力题按 🔊{{英文}} 格式。`,
          messages: [{ role: "user", content: `本批只出「${part}」共 ${count} 题。不要与这些已有题目重复：\n${existing || "（无）"}` }],
        },
        Paper,
      );
      for (const q of r.data.problems.slice(0, count + 2)) {
        if (!q.stem.trim() || !q.answer.trim()) continue;
        await db.problem.create({ data: { subjectId: ["math", "chinese", "english"].includes(subject) ? subject : null, topic: code, stem: q.stem.trim(), answer: q.answer.trim(), solution: `【${q.module}】${q.solution}`, difficulty: q.difficulty, source: "bank" } });
      }
    }
    pool = await load();
  }
  if (pool.length === 0) throw new Error("题库为空，再试一次");
  const picked = pool.sort(() => Math.random() - 0.5).slice(0, size).sort((a, b) => a.difficulty - b.difficulty);
  const set = await db.practiceSet.create({ data: { childId, kind: "exam", title: `${STAGE_EXAM_NAME[stage]}模拟卷：${SECONDARY_SUBJECT_NAME[subject]}`, status: "ready", topic: code, timeLimitSec: cfg.minutes * 60, total: picked.length } });
  for (let i = 0; i < picked.length; i++) await db.practiceItem.create({ data: { setId: set.id, index: i, problemId: picked[i].id } });
  return set;
}
