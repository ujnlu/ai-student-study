import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { findTopic, getOrCreateLecture } from "@/lib/topics";

export const runtime = "nodejs";
export const maxDuration = 300;

/** POST { code, what: "lecture" } → 专题讲义（第一次由 AI 生成并缓存） */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { code?: string; what?: string; childId?: string };
  const childId = s.childId ?? body.childId;
  const child = childId ? await db.child.findFirst({ where: { id: childId, familyId: s.familyId } }) : null;
  if (!child) return NextResponse.json({ error: "孩子不存在" }, { status: 404 });
  if (!body.code || !findTopic(body.code)) return NextResponse.json({ error: "没有这个专题" }, { status: 404 });
  try {
    return NextResponse.json({ lecture: await getOrCreateLecture(body.code, child.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
