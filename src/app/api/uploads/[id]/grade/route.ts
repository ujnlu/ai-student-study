import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { gradeUpload } from "@/lib/ai/grading";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const upload = await db.upload.findFirst({ where: { id, child: { familyId: s.familyId } } });
  if (!upload) return NextResponse.json({ error: "不存在" }, { status: 404 });
  try {
    const result = await gradeUpload(id);
    return NextResponse.json({ ok: true, total: result.problems.length, wrong: result.problems.filter((p) => !p.isCorrect).length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "批改失败" }, { status: 500 });
  }
}
