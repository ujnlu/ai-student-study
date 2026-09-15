import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrCreateExplanation } from "@/lib/ai/explain";

export const runtime = "nodejs";
export const maxDuration = 300;

/** POST { childId?, force? } → { id, status, cached } */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { childId?: string; force?: boolean };
  const childId = s.childId ?? body.childId;
  if (!childId) return NextResponse.json({ error: "缺少 childId" }, { status: 400 });
  const child = await db.child.findFirst({ where: { id: childId, familyId: s.familyId } });
  if (!child) return NextResponse.json({ error: "孩子不存在" }, { status: 404 });
  const problem = await db.problem.findUnique({ where: { id } });
  if (!problem) return NextResponse.json({ error: "题目不存在" }, { status: 404 });

  const ex = await getOrCreateExplanation(id, childId, s.familyId, !!body.force);
  if (ex.status === "failed") return NextResponse.json({ id: ex.id, status: "failed", error: ex.error }, { status: 500 });
  return NextResponse.json({ id: ex.id, status: ex.status, cached: ex.cached });
}
