import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveAssistant, runComplete } from "@/lib/ai";
import { chatSystemPrompt } from "@/lib/speaking";

export const runtime = "nodejs";
export const maxDuration = 120;

const TITLE = "英语口语对话";
const MAX_TURNS = 16;

/**
 * POST { conversationId?, text } → { conversationId, reply }
 * 和橙橙用英语聊天：对话落库（Conversation / Message），家长端可回看。
 */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s?.childId) return NextResponse.json({ error: "请先用孩子的账号登录" }, { status: 401 });
  const child = await db.child.findFirst({ where: { id: s.childId, familyId: s.familyId } });
  if (!child) return NextResponse.json({ error: "孩子不存在" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { conversationId?: string; text?: string };
  const text = (body.text ?? "").trim().slice(0, 500);
  if (!text) return NextResponse.json({ error: "说点什么吧" }, { status: 400 });

  let conv = body.conversationId ? await db.conversation.findFirst({ where: { id: body.conversationId, childId: child.id } }) : null;
  if (!conv) conv = await db.conversation.create({ data: { childId: child.id, title: TITLE } });
  await db.message.create({ data: { conversationId: conv.id, role: "user", content: text } });

  const history = await db.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: "asc" }, take: MAX_TURNS * 2 });
  try {
    const assistant = await resolveAssistant(child.familyId, "tutor");
    const r = await runComplete(assistant, {
      system: chatSystemPrompt(child.name, child.grade),
      messages: history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    });
    const reply = r.text.trim() || "Sorry, can you say that again?\n(对不起，能再说一遍吗？)";
    await db.message.create({ data: { conversationId: conv.id, role: "assistant", content: reply } });
    await db.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });
    return NextResponse.json({ conversationId: conv.id, reply });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), conversationId: conv.id }, { status: 500 });
  }
}
