import { z } from "zod";
import { db } from "@/lib/db";
import { resolveAssistant, runJson } from "@/lib/ai";
import { gradeText, renderTemplate } from "@/lib/ai/prompts";
import { textbookContext, withTextbookContext } from "@/lib/textbook-context";

const Step = z.object({
  caption: z.string(),
  narration: z.string(),
  svg: z.string(),
});
export const ExplanationOut = z.object({
  title: z.string(),
  steps: z.array(Step).min(2).max(10),
  summary: z.string(),
  quiz: z.object({ question: z.string(), answer: z.string() }),
});
export type ExplanationStep = z.infer<typeof Step>;

const SUBJECT_NAME: Record<string, string> = { math: "数学", chinese: "语文", english: "英语" };

/** 只保留安全的 SVG：去掉脚本、事件、外链、foreignObject */
export function sanitizeSvg(raw: string): string {
  let s = raw.trim();
  const start = s.indexOf("<svg");
  const end = s.lastIndexOf("</svg>");
  if (start < 0 || end < 0) throw new Error("不是有效的 SVG");
  s = s.slice(start, end + 6);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<(foreignObject|image|iframe|object|embed|use)[\s\S]*?(\/>|<\/\1>)/gi, "");
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/\s(href|xlink:href)\s*=\s*("[^"]*"|'[^']*')/gi, "");
  s = s.replace(/javascript:/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  if (!/viewBox=/.test(s)) s = s.replace("<svg", '<svg viewBox="0 0 800 450"');
  // 统一去掉固定宽高，让它自适应容器
  s = s.replace(/<svg([^>]*?)\s(width|height)="[^"]*"/g, "<svg$1").replace(/<svg([^>]*?)\s(width|height)="[^"]*"/g, "<svg$1");
  return s;
}

export async function generateExplanation(problemId: string, childId: string) {
  const [problem, child] = await Promise.all([
    db.problem.findUniqueOrThrow({
      where: { id: problemId },
      include: { attempts: { where: { childId }, orderBy: { createdAt: "desc" }, take: 1 }, knowledgePoint: true },
    }),
    db.child.findUniqueOrThrow({ where: { id: childId }, include: { textbooks: { include: { textbookVersion: true } } } }),
  ]);
  const subjectId = problem.subjectId ?? "math";
  const textbook = child.textbooks.find((t) => t.subjectId === subjectId)?.textbookVersion.name ?? "人教版";
  const assistant = await resolveAssistant(child.familyId, "explain");
  const ctx = await textbookContext({ childId, subjectId, knowledgePointId: problem.knowledgePointId, knowledgePointName: problem.knowledgePoint?.name, query: problem.stem }).catch(() => null);
  const system = withTextbookContext(renderTemplate(assistant.systemPrompt, {
    childName: child.name,
    grade: child.grade,
    gradeText: gradeText(child.grade),
    semester: child.semester === 1 ? "上学期" : "下学期",
    subject: SUBJECT_NAME[subjectId] ?? "全科",
    textbook,
    region: child.region,
    problem: problem.stem,
    childAnswer: problem.attempts[0]?.childAnswer ?? "（没有作答）",
    correctAnswer: problem.answer,
    solution: problem.solution,
    knowledgePoints: problem.knowledgePoint?.name,
  }), ctx);

  try {
    const r = await runJson(
      assistant,
      { system, messages: [{ role: "user", content: "请生成这道题的分步讲解动画。" }] },
      ExplanationOut,
    );
    const steps = r.data.steps.map((s) => ({ ...s, svg: sanitizeSvg(s.svg) }));
    return db.explanation.create({
      data: {
        problemId,
        childId,
        assistantId: assistant.id,
        title: r.data.title,
        stepsJson: JSON.stringify(steps),
        summary: r.data.summary,
        quizQ: r.data.quiz.question,
        quizA: r.data.quiz.answer,
        status: "ready",
      },
    });
  } catch (e) {
    return db.explanation.create({
      data: {
        problemId,
        childId,
        assistantId: assistant.id,
        title: "生成失败",
        stepsJson: "[]",
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      },
    });
  }
}
