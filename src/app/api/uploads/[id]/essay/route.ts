import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { gradeEssay } from "@/lib/ai/essay";

export const runtime = "nodejs";
export const maxDuration = 300;

/** POST → 让 AI 点评这篇作文（Upload.kind 必须是 essay） */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const upload = await db.upload.findFirst({ where: { id, child: { familyId: s.familyId } } });
  if (!upload) return NextResponse.json({ error: "不存在" }, { status: 404 });
  if (upload.kind !== "essay") return NextResponse.json({ error: "这不是作文照片" }, { status: 400 });
  try {
    const r = await gradeEssay(id);
    return NextResponse.json({ ok: true, length: r.text.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "点评失败" }, { status: 500 });
  }
}
