import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { addStars } from "@/lib/rewards";
import { PK_WIN_STARS, pkWinReason } from "@/lib/pk";

export const runtime = "nodejs";

/** POST → PK 获胜加星（每局只加一次） */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s?.childId) return NextResponse.json({ error: "请先用孩子身份登录" }, { status: 401 });
  const { id } = await ctx.params;
  const set = await db.practiceSet.findFirst({ where: { id, childId: s.childId, kind: "pk" } });
  if (!set) return NextResponse.json({ error: "不存在" }, { status: 404 });
  if (set.status !== "done") return NextResponse.json({ error: "这局还没结束" }, { status: 400 });
  const reason = pkWinReason(set.id);
  const exists = await db.starEvent.findFirst({ where: { childId: set.childId, reason } });
  if (exists) return NextResponse.json({ ok: true, awarded: 0 });
  await addStars(set.childId, PK_WIN_STARS, reason);
  return NextResponse.json({ ok: true, awarded: PK_WIN_STARS });
}
