import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { deletePaper, parsePaper } from "@/lib/papers";

export const runtime = "nodejs";
export const maxDuration = 300;

/** GET → 状态；POST { action: "reparse" } → 重新解析；DELETE → 删除 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const p = await db.paper.findFirst({ where: { id, familyId: s.familyId }, select: { id: true, status: true, error: true, total: true } });
  if (!p) return NextResponse.json({ error: "不存在" }, { status: 404 });
  return NextResponse.json(p);
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || s.role !== "parent") return NextResponse.json({ error: "请用家长身份登录" }, { status: 401 });
  const { id } = await ctx.params;
  const p = await db.paper.findFirst({ where: { id, familyId: s.familyId } });
  if (!p) return NextResponse.json({ error: "不存在" }, { status: 404 });
  void parsePaper(id, s.familyId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || s.role !== "parent") return NextResponse.json({ error: "请用家长身份登录" }, { status: 401 });
  const { id } = await ctx.params;
  await deletePaper(id, s.familyId);
  return NextResponse.json({ ok: true });
}
