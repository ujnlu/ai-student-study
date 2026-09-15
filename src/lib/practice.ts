import { z } from "zod";
import { db } from "@/lib/db";
import { resolveAssistant, runJson } from "@/lib/ai";
import { gradeText, renderTemplate } from "@/lib/ai/prompts";
import { bumpMastery } from "@/lib/ai/grading";
import { answersMatch, generateOral } from "@/lib/oral";
import { textbookContext, withTextbookContext } from "@/lib/textbook-context";
import { addStars, STAR_RULES } from "@/lib/rewards";

export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 15, 30];
const SUBJECT_NAME: Record<string, string> = { math: "数学", chinese: "语文", english: "英语" };

const GeneratedProblems = z.object({
  problems: z.array(
    z.object({
      stem: z.string(),
      answer: z.string(),
      solution: z.string(),
      difficulty: z.number().int().min(1).max(5),
    }),
  ),
});

function addDays(n: number) {
  return new Date(Date.now() + n * 86400_000);
}

async function childCtx(childId: string) {
  const child = await db.child.findUniqueOrThrow({ where: { id: childId }, include: { textbooks: { include: { textbookVersion: true } } } });
  const vars = (subjectId: string) => ({
    childName: child.name,
    grade: child.grade,
    gradeText: gradeText(child.grade),
    semester: child.semester === 1 ? "上学期" : "下学期",
    subject: SUBJECT_NAME[subjectId] ?? "全科",
    textbook: child.textbooks.find((t) => t.subjectId === subjectId)?.textbookVersion.name ?? "人教版",
    region: child.region,
  });
  return { child, vars };
}

/** 口算：程序生成，不用 AI */
export async function createOralSet(childId: string, count = 20, timeLimitSec: number | null = 300) {
  const child = await db.child.findUniqueOrThrow({ where: { id: childId } });
  const items = generateOral(child.grade, child.semester, count);
  const set = await db.practiceSet.create({
    data: { childId, kind: "oral", title: `口算 ${count} 题`, status: "ready", total: items.length, timeLimitSec },
  });
  for (let i = 0; i < items.length; i++) {
    const p = await db.problem.create({
      data: { subjectId: "math", stem: items[i].stem, answer: items[i].answer, solution: items[i].tag, difficulty: 1, source: "generated" },
    });
    await db.practiceItem.create({ data: { setId: set.id, index: i, problemId: p.id } });
  }
  return set;
}

async function generateProblemsWithAi(childId: string, subjectId: string, instruction: string, kp?: { id?: string | null; name?: string | null }) {
  const { child, vars } = await childCtx(childId);
  const assistant = await resolveAssistant(child.familyId, "generate");
  const ctx = await textbookContext({ childId, subjectId, knowledgePointId: kp?.id, knowledgePointName: kp?.name, query: instruction.slice(0, 200) }).catch(() => null);
  const system = withTextbookContext(renderTemplate(assistant.systemPrompt, vars(subjectId)), ctx);
  const r = await runJson(assistant, { system, messages: [{ role: "user", content: instruction }] }, GeneratedProblems);
  return r.data.problems;
}

/** 变式题：针对一道错题，出 3 道同知识点的题 */
export async function createVariantSet(mistakeId: string, kind: "variant" | "review" = "variant") {
  const m = await db.mistakeEntry.findUniqueOrThrow({ where: { id: mistakeId }, include: { problem: { include: { knowledgePoint: true } } } });
  const subjectId = m.problem.subjectId ?? "math";
  const n = kind === "variant" ? 3 : 2;
  const problems = await generateProblemsWithAi(
    m.childId,
    subjectId,
    `原题：${m.problem.stem}\n正确答案：${m.problem.answer ?? "（未知）"}\n知识点：${m.problem.knowledgePoint?.name ?? "同原题"}\n\n请出 ${n} 道与原题考察同一知识点的变式题（换数字或换情境，难度相当或略低）。answer 只写最终答案，不要写单位以外的文字。`,
    { id: m.problem.knowledgePointId, name: m.problem.knowledgePoint?.name },
  );
  const set = await db.practiceSet.create({
    data: {
      childId: m.childId,
      kind,
      title: kind === "variant" ? `变式练习：${m.problem.stem.slice(0, 20)}` : `复习：${m.problem.stem.slice(0, 20)}`,
      status: "ready",
      mistakeId,
      knowledgePointId: m.problem.knowledgePointId,
      total: problems.length,
    },
  });
  for (let i = 0; i < problems.length; i++) {
    const q = problems[i];
    const p = await db.problem.create({
      data: { subjectId, stem: q.stem, answer: q.answer, solution: q.solution, difficulty: q.difficulty, source: "variant", parentProblemId: m.problemId, knowledgePointId: m.problem.knowledgePointId },
    });
    await db.practiceItem.create({ data: { setId: set.id, index: i, problemId: p.id } });
  }
  if (kind === "variant") await db.mistakeEntry.update({ where: { id: mistakeId }, data: { status: "practicing" } });
  return set;
}

/** 家长发起：按知识点 AI 出题，进入待审核 */
export async function createAiSet(childId: string, knowledgePointId: string, count: number, difficulty: number) {
  const kp = await db.knowledgePoint.findUniqueOrThrow({ where: { id: knowledgePointId } });
  const problems = await generateProblemsWithAi(
    childId,
    kp.subjectId,
    `知识点：${kp.name}（${kp.grade}年级${kp.semester === 1 ? "上" : "下"}学期 · ${kp.unit}）\n难度：${difficulty}/5\n请出 ${count} 道题，题型多样（计算、填空、简单应用题），answer 只写最终答案。`,
    { id: kp.id, name: kp.name },
  );
  const set = await db.practiceSet.create({
    data: { childId, kind: "ai", title: `${kp.name} 练习`, status: "pending_review", knowledgePointId, total: problems.length },
  });
  for (let i = 0; i < problems.length; i++) {
    const q = problems[i];
    const p = await db.problem.create({
      data: { subjectId: kp.subjectId, stem: q.stem, answer: q.answer, solution: q.solution, difficulty: q.difficulty, source: "generated", knowledgePointId },
    });
    await db.practiceItem.create({ data: { setId: set.id, index: i, problemId: p.id } });
  }
  return set;
}

/** 答一题：立即判对错、记录作答、更新掌握度、错题入本（同一题只记第一次作答） */
export async function answerItem(setId: string, index: number, given: string) {
  const set = await db.practiceSet.findUniqueOrThrow({ where: { id: setId } });
  const it = await db.practiceItem.findUniqueOrThrow({ where: { setId_index: { setId, index } }, include: { problem: true } });
  if (set.status === "done" || it.isCorrect !== null) {
    return { isCorrect: it.isCorrect ?? false, correctAnswer: it.problem.answer ?? "", solution: it.problem.solution, problemId: it.problemId, alreadyAnswered: true };
  }
  const ok = answersMatch(given, it.problem.answer ?? "");
  await db.practiceItem.update({ where: { id: it.id }, data: { childAnswer: given, isCorrect: ok } });
  await db.attempt.create({ data: { childId: set.childId, problemId: it.problemId, childAnswer: given, isCorrect: ok, errorType: ok ? null : "unknown", durationSec: null } });
  if (it.problem.knowledgePointId) await bumpMastery(set.childId, it.problem.knowledgePointId, ok);
  if (!ok && set.kind !== "review") {
    await db.mistakeEntry.upsert({
      where: { childId_problemId: { childId: set.childId, problemId: it.problemId } },
      create: { childId: set.childId, problemId: it.problemId, errorType: "unknown" },
      update: {},
    });
  }
  return { isCorrect: ok, correctAnswer: it.problem.answer ?? "", solution: it.problem.solution, problemId: it.problemId, alreadyAnswered: false };
}

/** 交卷：未答的题按错处理，汇总得分，推进错题状态与复习计划 */
export async function submitSet(setId: string, answers: Record<string, string> = {}, durationSec?: number) {
  const set = await db.practiceSet.findUniqueOrThrow({ where: { id: setId }, include: { items: { orderBy: { index: "asc" } } } });
  if (set.status === "done") return set;
  for (const it of set.items) {
    if (it.isCorrect === null) await answerItem(setId, it.index, answers[String(it.index)] ?? "");
  }
  const items = await db.practiceItem.findMany({ where: { setId } });
  const score = items.filter((i) => i.isCorrect).length;
  const allCorrect = score === items.length;
  // 星星
  await addStars(set.childId, score * STAR_RULES.practiceCorrect, `练习答对 ${score} 题`);
  if (allCorrect && items.length > 0) await addStars(set.childId, STAR_RULES.practicePerfect, "一组全对");
  if (set.kind === "sync") await addStars(set.childId, STAR_RULES.syncDone, "完成同步练");

  if (set.mistakeId) {
    const m = await db.mistakeEntry.findUnique({ where: { id: set.mistakeId } });
    if (m) {
      if (set.kind === "variant") {
        await db.mistakeEntry.update({
          where: { id: m.id },
          data: allCorrect
            ? { status: "cleared", clearedAt: new Date(), reviewCount: 0, nextReviewAt: addDays(REVIEW_INTERVALS_DAYS[0]) }
            : { status: "practicing" },
        });
        if (allCorrect) await addStars(set.childId, STAR_RULES.mistakeCleared, "消灭一道错题");
      } else if (set.kind === "review") {
        if (allCorrect) {
          const next = m.reviewCount + 1;
          await db.mistakeEntry.update({
            where: { id: m.id },
            data: { reviewCount: next, nextReviewAt: next < REVIEW_INTERVALS_DAYS.length ? addDays(REVIEW_INTERVALS_DAYS[next]) : null },
          });
          await addStars(set.childId, STAR_RULES.reviewPass, "复习通过");
        } else {
          // 复习没过：回到"讲过了"，重新走变式题
          await db.mistakeEntry.update({ where: { id: m.id }, data: { status: "explained", reviewCount: 0, nextReviewAt: null, clearedAt: null } });
        }
      }
    }
  }

  return db.practiceSet.update({
    where: { id: setId },
    data: { status: "done", score, durationSec: durationSec ?? null, completedAt: new Date() },
    include: { items: { include: { problem: true }, orderBy: { index: "asc" } } },
  });
}

/** 到期需要复习的错题（已消灭且 nextReviewAt <= 现在） */
export function dueReviews(childId: string) {
  return db.mistakeEntry.findMany({
    where: { childId, status: "cleared", nextReviewAt: { lte: new Date() } },
    include: { problem: { include: { knowledgePoint: true } } },
    orderBy: { nextReviewAt: "asc" },
  });
}

/** 孩子首页的今日任务 */
export async function todayTasks(childId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [oralDoneToday, syncDoneToday, newMistakes, explained, due, readySets, uploadsToday] = await Promise.all([
    db.practiceSet.count({ where: { childId, kind: "oral", status: "done", completedAt: { gte: start } } }),
    db.practiceSet.count({ where: { childId, kind: "sync", status: "done", completedAt: { gte: start } } }),
    db.mistakeEntry.count({ where: { childId, status: "new" } }),
    db.mistakeEntry.findMany({ where: { childId, status: { in: ["explained", "practicing"] } }, include: { problem: true }, take: 10 }),
    dueReviews(childId),
    db.practiceSet.findMany({ where: { childId, status: "ready", kind: { in: ["ai", "variant", "review"] } }, orderBy: { createdAt: "desc" }, include: { mistake: { include: { problem: true } }, knowledgePoint: true } }),
    db.upload.count({ where: { childId, createdAt: { gte: start } } }),
  ]);
  return { oralDoneToday: oralDoneToday > 0, syncDoneToday: syncDoneToday > 0, newMistakes, explained, due, readySets, uploadsToday };
}

/** 连续学习天数：当天有上传或完成练习都算 */
export async function streakDays(childId: string) {
  const [ups, sets] = await Promise.all([
    db.upload.findMany({ where: { childId }, select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 300 }),
    db.practiceSet.findMany({ where: { childId, status: "done" }, select: { completedAt: true }, orderBy: { completedAt: "desc" }, take: 300 }),
  ]);
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const days = new Set([...ups.map((u) => key(u.createdAt)), ...sets.map((s) => key(s.completedAt!))]);
  const d = new Date();
  let streak = 0;
  if (!days.has(key(d))) d.setDate(d.getDate() - 1);
  while (days.has(key(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
