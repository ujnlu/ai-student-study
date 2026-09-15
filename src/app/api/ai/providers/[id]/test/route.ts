import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientForProvider } from "@/lib/ai";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || s.role !== "parent") return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const p = await db.aiProvider.findFirst({ where: { id, familyId: s.familyId } });
  if (!p) return NextResponse.json({ error: "不存在" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { model?: string };
  const { client } = await clientForProvider(id);
  const r = await client.ping(body.model || p.defaultModel);
  return NextResponse.json(r);
}
