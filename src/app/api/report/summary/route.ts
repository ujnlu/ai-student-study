import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveAssistant, runComplete } from "@/lib/ai";
import { buildReport, reportToText } from "@/lib/report";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST { childId } → AI 周评 */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "parent") return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { childId } = (await req.json()) as { childId: string };
  const child = await db.child.findFirst({ where: { id: childId, familyId: s.familyId } });
  if (!child) return NextResponse.json({ error: "孩子不存在" }, { status: 404 });
  try {
    const report = await buildReport(childId);
    const assistant = await resolveAssistant(s.familyId, "tutor");
    const r = await runComplete(assistant, {
      system: `你是一位有经验的小学班主任，给家长写一段本周学习点评。要求：
- 200 字左右，先说做得好的，再指出 1-2 个最需要关注的知识点或习惯，最后给下周 2 条具体可执行的建议（比如每天练几题什么、复习哪一课）。
- 语气温和、具体，引用数据说话，不说空话。
- 用中文，分 3 个小段，不要用 markdown 标题。`,
      messages: [{ role: "user", content: reportToText(report) }],
      maxTokens: 1500,
    });
    return NextResponse.json({ text: r.text });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
