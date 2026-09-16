import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { addStars } from "@/lib/rewards";
import { generatePiece, nextPiece, parsePiece } from "@/lib/reading";

export const runtime = "nodejs";
export const maxDuration = 120;

const READ_STARS = 6;

/** GET ?lang=zh|en&level=1-6&fresh=1 → 一篇没读过的短文（fresh=1 强制新生成） */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s?.childId) return NextResponse.json({ error: "请先用孩子的账号登录" }, { status: 401 });
  const u = new URL(req.url);
  const lang = u.searchParams.get("lang") === "en" ? "en" : "zh";
  const level = Math.min(6, Math.max(1, Number(u.searchParams.get("level")) || 1));
  const id = u.searchParams.get("id");
  try {
    if (id) {
      const row = await db.readingPiece.findUnique({ where: { id } });
      const parsed = row && parsePiece(row);
      if (!parsed) return NextResponse.json({ error: "没有这篇" }, { status: 404 });
      return NextResponse.json(parsed);
    }
    return NextResponse.json(u.searchParams.get("fresh") ? await generatePiece(s.childId, lang, level) : await nextPiece(s.childId, lang, level));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "生成失败" }, { status: 500 });
  }
}

/** POST { id, readAccuracy, correct, total } → 记录 + 星星 */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s?.childId) return NextResponse.json({ error: "请先用孩子的账号登录" }, { status: 401 });
  const child = await db.child.findFirst({ where: { id: s.childId, familyId: s.familyId } });
  if (!child) return NextResponse.json({ error: "孩子不存在" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { id?: string; readAccuracy?: number; correct?: number; total?: number };
  const piece = body.id ? await db.readingPiece.findUnique({ where: { id: body.id } }) : null;
  if (!piece) return NextResponse.json({ error: "缺少短文" }, { status: 400 });
  const read = Math.max(0, Math.min(100, Math.round(Number(body.readAccuracy ?? 0))));
  const correct = Math.max(0, Number(body.correct ?? 0));
  const total = Math.max(1, Number(body.total ?? 3));
  const quiz = Math.round((correct / total) * 100);
  const accuracy = Math.round((read + quiz) / 2);
  await db.recitation.create({ data: { childId: child.id, kind: "reading", title: `${piece.lang === "en" ? "英文" : "中文"}分级阅读 L${piece.level}《${piece.title}》`, text: piece.id, transcript: `朗读 ${read}% · 答题 ${correct}/${total}`, accuracy } });
  const stars = quiz === 100 ? READ_STARS : quiz >= 60 ? Math.floor(READ_STARS / 2) : 0;
  if (stars) await addStars(child.id, stars, `分级阅读《${piece.title}》`);
  return NextResponse.json({ accuracy, stars });
}
