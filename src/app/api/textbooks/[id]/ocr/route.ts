import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { startOcrInBackground } from "@/lib/textbook-import";

export const runtime = "nodejs";

/** POST → 后台用 AI 识别这本书所有图片页的文字 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || s.role !== "parent") return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const tb = await db.textbook.findUnique({ where: { id } });
  if (!tb) return NextResponse.json({ error: "不存在" }, { status: 404 });
  const started = startOcrInBackground(tb.id, s.familyId);
  return NextResponse.json({ started });
}
