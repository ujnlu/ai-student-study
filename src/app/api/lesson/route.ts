import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrCreateMicroLesson, getOrCreatePreview } from "@/lib/lesson-guide";

export const runtime = "nodejs";
export const maxDuration = 300;

/** POST { chapterId, what: "preview" | "micro", force? } */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = (await req.json()) as { chapterId: string; what: "preview" | "micro"; force?: boolean; childId?: string };
  const childId = s.childId ?? body.childId;
  const child = childId ? await db.child.findFirst({ where: { id: childId, familyId: s.familyId } }) : null;
  if (!child) return NextResponse.json({ error: "孩子不存在" }, { status: 404 });
  try {
    if (body.what === "preview") return NextResponse.json({ preview: await getOrCreatePreview(body.chapterId, child.id) });
    const ex = await getOrCreateMicroLesson(body.chapterId, child.id, !!body.force);
    return NextResponse.json({ explanationId: ex.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
