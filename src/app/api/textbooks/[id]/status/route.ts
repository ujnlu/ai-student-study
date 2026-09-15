import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const tb = await db.textbook.findFirst({
    where: { OR: [{ id }, { smarteduId: id }] },
    select: { id: true, status: true, progress: true, error: true, pageCount: true },
  });
  if (!tb) return NextResponse.json({ status: "none" });
  return NextResponse.json(tb);
}
