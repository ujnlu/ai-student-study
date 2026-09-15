import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOrCreateWordList } from "@/lib/dictation";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST { chapterId } → 这一课的听写词表（没有就用 AI 从课文提取并缓存） */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { chapterId?: string };
  if (!body.chapterId) return NextResponse.json({ error: "缺少 chapterId" }, { status: 400 });
  try {
    const wl = await getOrCreateWordList(body.chapterId, s.familyId);
    return NextResponse.json(wl);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "生成词表失败" }, { status: 500 });
  }
}
