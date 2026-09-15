import fs from "node:fs/promises";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveAssistant, runJson } from "@/lib/ai";
import { gradeText, renderTemplate } from "@/lib/ai/prompts";
import { uploadAbsPath } from "@/lib/uploads";
import { textbookContext, withTextbookContext } from "@/lib/textbook-context";
import { addStars, STAR_RULES } from "@/lib/rewards";
import { preGenerateInBackground } from "@/lib/ai/explain";

export const GradedProblem = z.object({
  index: z.number().int().describe("题号，从 1 开始"),
  stem: z.string().describe("题目原文，含数字和运算符"),
  childAnswer: z.string().describe("孩子写的答案，没写则为空字符串"),
  correctAnswer: z.string().describe("正确答案"),
  isCorrect: z.boolean(),
  knowledgePoint: z.string().describe("知识点名称"),
  errorType: z.enum(["concept", "calculation", "reading", "careless", "unknown", "none"]),
  comment: z.string().describe("一句话点评，正确时可为空"),
  box: z
    .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
    .nullable()
    .describe("这道题在图片中的位置，左上角 x,y 与宽高 w,h，均为相对图片宽高的 0-1 比例；无法判断时为 null"),
});

export const GradingResult = z.object({
  subject: z.enum(["math", "chinese", "english", "other"]),
  summary: z.string(),
  problems: z.array(GradedProblem),
});
export type GradingResult = z.infer<typeof GradingResult>;

const SUBJECT_NAME: Record<string, string> = { math: "数学", chinese: "语文", english: "英语" };

export async function gradeUpload(uploadId: string) {
  const upload = await db.upload.findUniqueOrThrow({
    where: { id: uploadId },
    include: { child: { include: { textbooks: { include: { textbookVersion: true } } } } },
  });
  await db.upload.update({ where: { id: uploadId }, data: { status: "grading", error: null } });

  try {
    const child = upload.child;
    const subjectId = upload.subjectId ?? "math";
    const textbook = child.textbooks.find((t) => t.subjectId === subjectId)?.textbookVersion.name ?? "人教版";
    const assistant = await resolveAssistant(child.familyId, "grade");
    const ctx = await textbookContext({ childId: child.id, subjectId, query: null }).catch(() => null);
    const system = withTextbookContext(
      renderTemplate(assistant.systemPrompt, {
        childName: child.name,
        grade: child.grade,
        gradeText: gradeText(child.grade),
        semester: child.semester === 1 ? "上学期" : "下学期",
        subject: SUBJECT_NAME[subjectId] ?? "全科",
        textbook,
        region: child.region,
      }),
      ctx,
    );

    const buf = await fs.readFile(uploadAbsPath(upload.filePath));
    const r = await runJson(
      assistant,
      {
        system,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", mimeType: upload.mimeType, base64: buf.toString("base64") },
              { type: "text", text: "请批改这张作业。" },
            ],
          },
        ],
      },
      GradingResult,
    );

    const result = r.data;
    // 清掉旧结果（重新批改时）
    await db.problem.deleteMany({ where: { uploadId } });

    for (const p of result.problems) {
      const kp = await matchKnowledgePoint(subjectId, child, p.knowledgePoint);
      const problem = await db.problem.create({
        data: {
          subjectId: result.subject === "other" ? null : result.subject,
          uploadId,
          knowledgePointId: kp?.id,
          index: p.index,
          stem: p.stem,
          answer: p.correctAnswer,
          solution: p.comment || null,
          source: "upload",
        },
      });
      await db.attempt.create({
        data: {
          childId: child.id,
          problemId: problem.id,
          childAnswer: p.childAnswer || null,
          isCorrect: p.isCorrect,
          errorType: p.isCorrect ? null : p.errorType === "none" ? "unknown" : p.errorType,
          aiComment: p.comment || null,
          box: p.box && p.box.w > 0 && p.box.h > 0 ? JSON.stringify(p.box) : null,
        },
      });
      if (!p.isCorrect) {
        await db.mistakeEntry.upsert({
          where: { childId_problemId: { childId: child.id, problemId: problem.id } },
          create: { childId: child.id, problemId: problem.id, errorType: p.errorType === "none" ? "unknown" : p.errorType },
          update: {},
        });
        preGenerateInBackground(problem.id, child.id, child.familyId);
      }
      if (kp) await bumpMastery(child.id, kp.id, p.isCorrect);
    }

    await addStars(child.id, STAR_RULES.upload, "拍了一次作业");
    await db.upload.update({
      where: { id: uploadId },
      data: {
        status: "graded",
        subjectId: result.subject === "other" ? upload.subjectId : result.subject,
        summary: result.summary,
        rawResult: JSON.stringify(result),
        gradedAt: new Date(),
      },
    });
    return result;
  } catch (e) {
    await db.upload.update({
      where: { id: uploadId },
      data: { status: "failed", error: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}

/** 按名称在孩子当前教材的知识点里模糊匹配 */
async function matchKnowledgePoint(
  subjectId: string,
  child: { grade: number; textbooks: { subjectId: string; textbookVersionId: string }[] },
  name: string,
) {
  if (!name) return null;
  const tb = child.textbooks.find((t) => t.subjectId === subjectId);
  if (!tb) return null;
  const list = await db.knowledgePoint.findMany({
    where: { textbookVersionId: tb.textbookVersionId, grade: { in: [child.grade, child.grade - 1] } },
  });
  const exact = list.find((k) => k.name === name);
  if (exact) return exact;
  const partial = list.find((k) => name.includes(k.name) || k.name.includes(name));
  return partial ?? null;
}

export async function bumpMastery(childId: string, knowledgePointId: string, correct: boolean) {
  const m = await db.mastery.findUnique({ where: { childId_knowledgePointId: { childId, knowledgePointId } } });
  const prev = m?.score ?? 50;
  // 简单的指数平滑：对 +15 封顶 100，错 -20 保底 0
  const score = Math.max(0, Math.min(100, prev + (correct ? 15 : -20)));
  await db.mastery.upsert({
    where: { childId_knowledgePointId: { childId, knowledgePointId } },
    create: { childId, knowledgePointId, score, attempts: 1, correct: correct ? 1 : 0 },
    update: { score, attempts: { increment: 1 }, correct: { increment: correct ? 1 : 0 } },
  });
}
