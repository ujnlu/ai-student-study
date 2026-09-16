import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrCreateWalkthrough } from "@/lib/walkthrough";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST { childId?, force? } → { text }（解题讲解，生成一次后缓存） */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { childId?: string; force?: boolean };
  const childId = s.childId ?? body.childId;
  const child = childId ? await db.child.findFirst({ where: { id: childId, familyId: s.familyId } }) : null;
  if (!child) return NextResponse.json({ error: "缺少学习者" }, { status: 400 });
  try {
    return NextResponse.json({ text: await getOrCreateWalkthrough(id, child.id, !!body.force) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
