import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { createPkSet, opponentSpeedSec } from "@/lib/pk";

export const runtime = "nodejs";

/** POST { count? } → 新建一局口算 PK */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s?.childId) return NextResponse.json({ error: "请先用孩子身份登录" }, { status: 401 });
  const child = await db.child.findFirst({ where: { id: s.childId, familyId: s.familyId } });
  if (!child) return NextResponse.json({ error: "孩子不存在" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { count?: number };
  try {
    const set = await createPkSet(child.id, Math.min(30, Math.max(5, Number(body.count) || 10)));
    return NextResponse.json({ id: set.id, opponentSpeedSec: opponentSpeedSec(child.grade) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
