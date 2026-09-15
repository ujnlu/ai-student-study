import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { answerItem } from "@/lib/practice";

export const runtime = "nodejs";

/** POST { index, answer } → 立即判对错 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const set = await db.practiceSet.findFirst({ where: { id, child: { familyId: s.familyId } } });
  if (!set) return NextResponse.json({ error: "不存在" }, { status: 404 });
  const body = (await req.json()) as { index: number; answer: string };
  const r = await answerItem(id, Number(body.index), String(body.answer ?? ""));
  return NextResponse.json(r);
}
