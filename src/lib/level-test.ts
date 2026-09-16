/**
 * 奥数级末定级测（参考学而思 12 级定级、高思升班机制）：一级 20 讲学完，做 20 题跨讲测试，≥70% 通关。
 * 题目：先从各讲题库各取一题（孩子没做过的），不够时用一次 AI 调用按本级讲次名出一整套，存为 topic = oly-l{n}-test。
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveAssistant, runJson } from "@/lib/ai";
import { gradeText, renderTemplate } from "@/lib/ai/prompts";
import { lecturesOfLevel } from "@/lib/topics";

export const LEVEL_TEST_SIZE = 20;
export const LEVEL_TEST_SECONDS = 40 * 60;
export const LEVEL_PASS = 70;

const Bank = z.object({ problems: z.array(z.object({ stem: z.string(), answer: z.string(), solution: z.string(), difficulty: z.number().int().min(1).max(5), lecture: z.number().int().describe("对应第几讲") })) });

export const levelTestCode = (level: number) => `oly-l${level}-test`;

export async function createLevelTest(childId: string, level: number) {
  const lectures = lecturesOfLevel(level);
  if (lectures.length === 0) throw new Error("没有这一级");
  const child = await db.child.findUniqueOrThrow({ where: { id: childId } });
  const codes = lectures.map((l) => l.code);
  const testCode = levelTestCode(level);
  const done = new Set((await db.attempt.findMany({ where: { childId, problem: { topic: { in: [...codes, testCode] } } }, select: { problemId: true } })).map((a) => a.problemId));
  // 各讲各取一题
  const perLecture = await db.problem.findMany({ where: { topic: { in: codes }, source: "bank", difficulty: { lte: 3 } } });
  const picked: typeof perLecture = [];
  for (const c of codes) {
    const cand = perLecture.filter((p) => p.topic === c && !done.has(p.id)).sort(() => Math.random() - 0.5)[0];
    if (cand) picked.push(cand);
  }
  if (picked.length < LEVEL_TEST_SIZE) {
    let pool = (await db.problem.findMany({ where: { topic: testCode, source: "bank" } })).filter((p) => !done.has(p.id));
    if (picked.length + pool.length < LEVEL_TEST_SIZE) {
      const assistant = await resolveAssistant(child.familyId, "generate");
      const grade = Math.ceil(level / 2);
      const system = renderTemplate(assistant.systemPrompt, { childName: child.name, grade, gradeText: gradeText(grade), semester: level % 2 ? "上学期" : "下学期", subject: "数学", textbook: "奥数", region: child.region });
      const need = LEVEL_TEST_SIZE - picked.length;
      const r = await runJson(
        assistant,
        {
          system: system + "\n\n这次出的是奥数级末定级测试题：覆盖下面各讲，每讲 1 题，难度 2-3，题目全部用文字描述，answer 只写最终答案，lecture 填对应第几讲。",
          messages: [{ role: "user", content: `第 ${level} 级（${gradeText(grade)}${level % 2 ? "上" : "下"}）共 ${lectures.length} 讲：\n${lectures.map((l) => `第 ${l.no} 讲 ${l.name}（${l.moduleName}）`).join("\n")}\n\n请出 ${Math.max(need, 10)} 道测试题。`.slice(0, 4000) }],
        },
        Bank,
      );
      for (const q of r.data.problems) {
        if (!q.stem.trim() || !q.answer.trim()) continue;
        pool.push(await db.problem.create({ data: { subjectId: "math", topic: testCode, stem: q.stem.trim(), answer: q.answer.trim(), solution: `第 ${q.lecture} 讲 · ${q.solution}`, difficulty: q.difficulty, source: "bank" } }));
      }
      pool = pool.filter((p) => !done.has(p.id));
    }
    pool.sort(() => Math.random() - 0.5);
    picked.push(...pool.slice(0, LEVEL_TEST_SIZE - picked.length));
  }
  if (picked.length === 0) throw new Error("题库为空");
  picked.sort((a, b) => a.difficulty - b.difficulty);
  const set = await db.practiceSet.create({
    data: { childId, kind: "leveltest", title: `奥数第 ${level} 级定级测`, status: "ready", topic: testCode, timeLimitSec: LEVEL_TEST_SECONDS, total: picked.length },
  });
  for (let i = 0; i < picked.length; i++) await db.practiceItem.create({ data: { setId: set.id, index: i, problemId: picked[i].id } });
  return set;
}

/** 各级定级测最好成绩（%） */
export async function levelTestResults(childId: string) {
  const sets = await db.practiceSet.findMany({ where: { childId, kind: "leveltest", status: "done" }, select: { topic: true, score: true, total: true } });
  const best = new Map<number, number>();
  for (const s of sets) {
    const m = /^oly-l(\d+)-test$/.exec(s.topic ?? "");
    if (!m) continue;
    const lv = Number(m[1]);
    const pct = s.total ? Math.round(((s.score ?? 0) / s.total) * 100) : 0;
    best.set(lv, Math.max(best.get(lv) ?? 0, pct));
  }
  return best;
}
