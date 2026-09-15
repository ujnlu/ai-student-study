/**
 * 每一课的"教"：预习卡（AI 从课文生成）、微课动画（AI 生成分步讲解）、国家平台课程教学视频链接。
 * 按章节缓存在 LessonGuide。
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveAssistant, runJson } from "@/lib/ai";
import { gradeText, renderTemplate } from "@/lib/ai/prompts";
import { sanitizeSvg, ExplanationOut } from "@/lib/ai/explain";
import { chapterPath } from "@/lib/sync";

const SUBJECT_NAME: Record<string, string> = { math: "数学", chinese: "语文", english: "英语" };

export const PreviewCard = z.object({
  summary: z.string().describe("这一课学什么，2-3 句，孩子能懂的话"),
  keyPoints: z.array(z.string()).min(2).max(5).describe("关键概念或方法，每条一句"),
  example: z.string().describe("课本里最典型的一道例题及解法，简短"),
  tips: z.string().describe("容易错的地方或小窍门，一句"),
  questions: z.array(z.object({ q: z.string(), a: z.string() })).min(2).max(3).describe("预习小问题"),
});
export type PreviewCard = z.infer<typeof PreviewCard>;

export async function chapterText(chapterId: string, maxChars = 3500) {
  const ch = await db.textbookChapter.findUniqueOrThrow({ where: { id: chapterId }, include: { textbook: true } });
  const pages = await db.textbookPage.findMany({
    where: { textbookId: ch.textbookId, pageNo: { gte: ch.pageStart ?? 1, lte: ch.pageEnd ?? ch.pageStart ?? 1 } },
    orderBy: { pageNo: "asc" },
  });
  const text = pages.map((p) => p.text).filter((t) => t.trim()).join("\n").slice(0, maxChars);
  return { chapter: ch, text, pages };
}

async function vars(childId: string, subjectId: string) {
  const child = await db.child.findUniqueOrThrow({ where: { id: childId }, include: { textbooks: { include: { textbookVersion: true } } } });
  return {
    child,
    v: {
      childName: child.name,
      grade: child.grade,
      gradeText: gradeText(child.grade),
      semester: child.semester === 1 ? "上学期" : "下学期",
      subject: SUBJECT_NAME[subjectId] ?? "全科",
      textbook: child.textbooks.find((t) => t.subjectId === subjectId)?.textbookVersion.name ?? "人教版",
      region: child.region,
    },
  };
}

export async function getGuide(chapterId: string) {
  return db.lessonGuide.findUnique({ where: { chapterId } });
}

/** 预习卡：没有就用 AI 生成并缓存 */
export async function getOrCreatePreview(chapterId: string, childId: string): Promise<PreviewCard> {
  const g = await db.lessonGuide.findUnique({ where: { chapterId } });
  if (g?.previewJson) return JSON.parse(g.previewJson) as PreviewCard;
  const { chapter, text } = await chapterText(chapterId);
  if (text.trim().length < 30) throw new Error("这一课还没有课本文字（图片版教材需要先在家长端识别文字）");
  const { child, v } = await vars(childId, chapter.textbook.subjectId);
  const assistant = await resolveAssistant(child.familyId, "generate");
  const path = await chapterPath(chapterId);
  const system = renderTemplate(assistant.systemPrompt, v) + `\n\n现在的任务不是出题，而是根据课本原文写一张"预习卡"，给${v.gradeText}的孩子课前看。语言要像老师在讲，简短、具体、有课本里的例子。`;
  const r = await runJson(
    assistant,
    { system, messages: [{ role: "user", content: `课时：${path}\n\n课本原文：\n${text}\n\n请生成这一课的预习卡。` }] },
    PreviewCard,
  );
  await db.lessonGuide.upsert({
    where: { chapterId },
    create: { chapterId, previewJson: JSON.stringify(r.data) },
    update: { previewJson: JSON.stringify(r.data) },
  });
  return r.data;
}

const LESSON_PROMPT = `你是一位擅长把知识讲得"看得见"的小学{subject}老师，要为{childName}（{gradeText}{semester}，{textbook}教材）制作一段 4-6 步的"微课"动画，讲清楚这一课的核心概念和方法（不是讲某一道题）。

每一步包含：
- caption：屏幕上显示的一句话（不超过 20 字）。
- narration：老师口头讲的话，口语化、亲切，2-3 句。第一步用生活场景引入，中间用课本例题演示，最后一步总结方法并鼓励孩子。
- svg：这一步的画面，一个完整的 <svg> 字符串，viewBox='0 0 800 450'，白底；SVG 属性值一律用单引号，绝对不要用双引号。

画面要求：用画图的方式讲道理（小方块、圆点、阵列、数轴、分数条、简单场景），只用 rect/circle/line/path/text/g，字号至少 28，配色柔和（#f97316、#3b82f6、#22c55e、#fbbf24），每步画面在上一步基础上增加或高亮；不要 <script>、<image>、外链、CSS 动画、foreignObject；SVG 要精简，每步不超过 30 个元素，整段输出控制在 6000 字以内。数字和计算必须正确，例子尽量用课本上的。

最后给出 summary（一句话方法总结）和一道 quiz（课本难度的小题，含答案）。`;

/** 微课动画：为这一课生成一个 Explanation（挂在一道"课时"占位题上），缓存 */
export async function getOrCreateMicroLesson(chapterId: string, childId: string, force = false) {
  const g = await db.lessonGuide.findUnique({ where: { chapterId } });
  if (!force && g?.explanationId) {
    const ex = await db.explanation.findUnique({ where: { id: g.explanationId } });
    if (ex && ex.status === "ready") return ex;
  }
  const { chapter, text } = await chapterText(chapterId, 3000);
  const subjectId = chapter.textbook.subjectId;
  const { child, v } = await vars(childId, subjectId);
  const assistant = await resolveAssistant(child.familyId, "explain");
  const path = await chapterPath(chapterId);
  const system = renderTemplate(LESSON_PROMPT, v) + (text.trim() ? `\n\n【课本原文（节选）】\n${text}` : "");
  // 占位题：一个章节一道
  const kp = await db.knowledgePoint.findFirst({ where: { chapterId } });
  const problem =
    (await db.problem.findFirst({ where: { chapterId, source: "lesson" } })) ??
    (await db.problem.create({ data: { subjectId, chapterId, knowledgePointId: kp?.id ?? null, stem: `微课：${path.split(" › ").pop()}`, answer: null, source: "lesson" } }));
  const { runJson: run } = await import("@/lib/ai");
  const r = await run(assistant, { system, messages: [{ role: "user", content: `课时：${path}\n请生成这一课的微课动画。` }] }, ExplanationOut);
  const steps = r.data.steps.map((s) => ({ ...s, svg: sanitizeSvg(s.svg) }));
  const ex = await db.explanation.create({
    data: {
      problemId: problem.id,
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
  await db.lessonGuide.upsert({ where: { chapterId }, create: { chapterId, explanationId: ex.id }, update: { explanationId: ex.id } });
  return ex;
}
