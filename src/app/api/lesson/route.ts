import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrCreateMicroLesson, getOrCreatePreview } from "@/lib/lesson-guide";
import { resolveLessonVideo } from "@/lib/lesson-video";

export const runtime = "nodejs";
export const maxDuration = 300;

/** POST { chapterId, what: "preview" | "micro" | "video", force? } */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = (await req.json()) as { chapterId: string; what: "preview" | "micro" | "video"; force?: boolean; childId?: string };
  const childId = s.childId ?? body.childId;
  const child = childId ? await db.child.findFirst({ where: { id: childId, familyId: s.familyId } }) : null;
  if (!child) return NextResponse.json({ error: "孩子不存在" }, { status: 404 });
  try {
    if (body.what === "preview") return NextResponse.json({ preview: await getOrCreatePreview(body.chapterId, child.id) });
    if (body.what === "video") {
      const v = await resolveLessonVideo(body.chapterId);
      if (!v) return NextResponse.json({ error: "平台上暂时没找到这一课的视频" }, { status: 404 });
      return NextResponse.json({ url: v.url, title: v.title });
    }
    const ex = await getOrCreateMicroLesson(body.chapterId, child.id, !!body.force);
    return NextResponse.json({ explanationId: ex.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
