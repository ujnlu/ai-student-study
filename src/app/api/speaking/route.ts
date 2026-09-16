import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { addStars, STAR_RULES } from "@/lib/rewards";
import { getOrCreateSpeakingLesson } from "@/lib/speaking";

export const runtime = "nodejs";
export const maxDuration = 120;

const SPEAKING_PASS = 80;

/** GET ?code= → 这组跟读的句子（第一次由 AI 生成并缓存） */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s?.childId) return NextResponse.json({ error: "请先用孩子的账号登录" }, { status: 401 });
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return NextResponse.json({ error: "缺少 code" }, { status: 400 });
  try {
    return NextResponse.json(await getOrCreateSpeakingLesson(code, s.childId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "生成失败" }, { status: 500 });
  }
}

/** POST { code, title, accuracy, transcript? } → 记录一次跟读成绩、发星星 */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s?.childId) return NextResponse.json({ error: "请先用孩子的账号登录" }, { status: 401 });
  const child = await db.child.findFirst({ where: { id: s.childId, familyId: s.familyId } });
  if (!child) return NextResponse.json({ error: "孩子不存在" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { code?: string; title?: string; accuracy?: number; transcript?: string; count?: number };
  const accuracy = Math.max(0, Math.min(100, Math.round(Number(body.accuracy ?? 0))));
  const title = (body.title ?? "").trim() || "英语跟读";
  await db.recitation.create({
    data: { childId: child.id, kind: "speaking", title, text: body.code ?? "", transcript: (body.transcript ?? "").slice(0, 2000) || null, accuracy },
  });
  const stars = accuracy >= SPEAKING_PASS ? STAR_RULES.speakingPass : accuracy >= 60 ? Math.floor(STAR_RULES.speakingPass / 2) : 0;
  if (stars) await addStars(child.id, stars, `英语跟读《${title}》${accuracy}%`);
  return NextResponse.json({ accuracy, stars });
}
