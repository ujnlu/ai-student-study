/**
 * 作文点评：把作文照片交给"作文点评"助手，按六个维度给出文字点评，存进 Upload.summary。
 */
import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { resolveAssistant, runComplete } from "@/lib/ai";
import { gradeText, renderTemplate } from "@/lib/ai/prompts";
import { uploadAbsPath } from "@/lib/uploads";
import { addStars } from "@/lib/rewards";

export const ESSAY_STARS = 5;
export const ESSAY_DIMENSIONS = ["内容", "结构", "语言", "书写", "错别字", "亮点"] as const;

export async function gradeEssay(uploadId: string) {
  const upload = await db.upload.findUniqueOrThrow({
    where: { id: uploadId },
    include: { child: { include: { textbooks: { include: { textbookVersion: true } } } } },
  });
  if (upload.kind !== "essay") throw new Error("这不是作文照片");
  await db.upload.update({ where: { id: uploadId }, data: { status: "grading", error: null } });

  try {
    const child = upload.child;
    const subjectId = upload.subjectId ?? "chinese";
    const textbook = child.textbooks.find((t) => t.subjectId === subjectId)?.textbookVersion.name ?? "统编版";
    const assistant = await resolveAssistant(child.familyId, "essay");
    const system = renderTemplate(assistant.systemPrompt, {
      childName: child.name,
      grade: child.grade,
      gradeText: gradeText(child.grade),
      semester: child.semester === 1 ? "上学期" : "下学期",
      subject: subjectId === "english" ? "英语" : "语文",
      textbook,
      region: child.region,
    });
    const buf = await fs.readFile(uploadAbsPath(upload.filePath));
    const r = await runComplete(assistant, {
      system,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", mimeType: upload.mimeType, base64: buf.toString("base64") },
            { type: "text", text: "请点评这篇作文。" },
          ],
        },
      ],
    });
    const text = r.text.trim();
    if (!text) throw new Error("老师没有给出点评，再试一次");

    await addStars(child.id, ESSAY_STARS, "作文点评");
    await db.upload.update({
      where: { id: uploadId },
      data: { status: "graded", summary: text, rawResult: JSON.stringify({ text }), gradedAt: new Date() },
    });
    return { text };
  } catch (e) {
    await db.upload.update({
      where: { id: uploadId },
      data: { status: "failed", error: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}
