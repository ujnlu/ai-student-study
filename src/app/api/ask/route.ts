import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveAssistant, runComplete } from "@/lib/ai";
import { saveImage, uploadAbsPath } from "@/lib/uploads";

export const runtime = "nodejs";
export const maxDuration = 120;

const SUBJECTS = new Set(["math", "chinese", "english"]);
const TRANSCRIBE_SYSTEM = "你是一位细心的小学老师。只把图片里的题目原文抄写出来，不要解答，不要加任何解释或评论。多道题时按顺序编号，每题一段。看不清的字用「□」代替。";
const PHOTO_FAIL_MSG = "橙橙暂时看不清这张照片，你把题目打字发给我也行哦～";

/**
 * POST /api/ask —— 孩子「问橙橙」：新建一段答疑对话。
 * 支持 JSON { text, subjectId } 或 multipart（file + 可选 text/subjectId）。
 * 只创建 Conversation + 第一条用户消息（题目），老师的回复由前端通过 /api/tutor 触发。
 */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s?.childId) return NextResponse.json({ error: "请先用孩子的身份登录" }, { status: 401 });
  const child = await db.child.findFirst({ where: { id: s.childId, familyId: s.familyId } });
  if (!child) return NextResponse.json({ error: "孩子不存在" }, { status: 400 });

  let text = "";
  let subjectId: string | null = null;
  let file: File | null = null;
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      text = String(form.get("text") ?? "").trim();
      subjectId = String(form.get("subjectId") ?? "") || null;
      const f = form.get("file");
      if (f instanceof File && f.size > 0) file = f;
    } else {
      const body = (await req.json().catch(() => ({}))) as { text?: string; subjectId?: string };
      text = String(body.text ?? "").trim();
      subjectId = body.subjectId || null;
    }
  } catch {
    return NextResponse.json({ error: "请求格式不对" }, { status: 400 });
  }
  if (subjectId && !SUBJECTS.has(subjectId)) subjectId = null;
  if (!text && !file) return NextResponse.json({ error: "把题目打出来，或者拍一张照片吧" }, { status: 400 });
  if (text.length > 2000) text = text.slice(0, 2000);

  // 拍照：先存图，再让「作业批改」助手（支持看图）把题目抄写成文字
  let uploadId: string | null = null;
  let question = text;
  let fromPhoto = false;
  if (file) {
    let upload;
    try {
      upload = await saveImage(child.id, file, "question", subjectId);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "图片保存失败" }, { status: 400 });
    }
    uploadId = upload.id;
    try {
      const assistant = await resolveAssistant(child.familyId, "grade");
      const buf = await fs.readFile(uploadAbsPath(upload.filePath));
      const r = await runComplete(assistant, {
        system: TRANSCRIBE_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", mimeType: upload.mimeType, base64: buf.toString("base64") },
              { type: "text", text: text ? `请抄写图片里的题目。孩子补充说：${text}` : "请抄写图片里的题目。" },
            ],
          },
        ],
      });
      const transcribed = r.text.trim();
      if (!transcribed) throw new Error("没有识别到题目");
      question = text ? `${transcribed}\n\n孩子补充：${text}` : transcribed;
      fromPhoto = true;
    } catch (e) {
      // 看图失败（比如模型不支持图片）：有文字就退回用文字继续，否则友好提示
      if (!text) {
        const detail = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: PHOTO_FAIL_MSG, detail: detail.slice(0, 200) }, { status: 400 });
      }
      question = text;
      fromPhoto = true;
    }
  }

  const title = question.replace(/\s+/g, " ").slice(0, 40);
  const lines = [`题目：${question}${fromPhoto ? "（来自拍照）" : ""}`];
  if (uploadId) lines.push(`[upload:${uploadId}]`);

  const conv = await db.conversation.create({
    data: {
      childId: child.id,
      title,
      messages: { create: { role: "user", content: lines.join("\n") } },
    },
  });
  return NextResponse.json({ conversationId: conv.id });
}
