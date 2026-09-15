import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { setProgress } from "@/lib/sync";

export const runtime = "nodejs";

/** POST { childId?, subjectId, chapterId } 设置"学到哪了" */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = (await req.json()) as { childId?: string; subjectId: string; chapterId: string };
  const childId = s.childId ?? body.childId;
  const child = childId ? await db.child.findFirst({ where: { id: childId, familyId: s.familyId } }) : null;
  if (!child) return NextResponse.json({ error: "孩子不存在" }, { status: 404 });
  await setProgress(child.id, body.subjectId, body.chapterId);
  return NextResponse.json({ ok: true });
}
