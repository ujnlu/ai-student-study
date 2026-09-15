import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { addStars } from "@/lib/rewards";
import { extractReciteText, scoreRecitation } from "@/lib/recite";

export const runtime = "nodejs";
export const maxDuration = 120;

const RECITE_STARS = 8; // 背诵准确率 ≥ 90% 奖励
const PASS = 90;
const PARENT_CONFIRM = "家长确认";

/** GET ?chapterId= → 这一课要背的古诗 / 段落 */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const chapterId = new URL(req.url).searchParams.get("chapterId");
  if (!chapterId) return NextResponse.json({ error: "缺少 chapterId" }, { status: 400 });
  try {
    return NextResponse.json(await extractReciteText(chapterId, s.familyId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "提取课文失败" }, { status: 500 });
  }
}

/** POST { chapterId?, title, text, transcript } → 打分、保存、发星星 */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s?.childId) return NextResponse.json({ error: "请先用孩子的账号登录" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { chapterId?: string; title?: string; text?: string; transcript?: string };
  const text = (body.text ?? "").trim();
  const transcript = (body.transcript ?? "").trim();
  if (!text) return NextResponse.json({ error: "缺少原文" }, { status: 400 });
  const child = await db.child.findFirst({ where: { id: s.childId, familyId: s.familyId } });
  if (!child) return NextResponse.json({ error: "孩子不存在" }, { status: 404 });

  const scored = scoreRecitation(text, transcript);
  const parentConfirmed = transcript === PARENT_CONFIRM;
  const accuracy = parentConfirmed ? 100 : scored.accuracy;
  const diff = parentConfirmed ? scored.diff.map((d) => ({ ...d, ok: true })) : scored.diff;
  const title = (body.title ?? "").trim() || "背诵";

  const chapter = body.chapterId ? await db.textbookChapter.findUnique({ where: { id: body.chapterId }, select: { id: true } }) : null;
  await db.recitation.create({
    data: { childId: child.id, chapterId: chapter?.id ?? null, title, text, transcript: transcript || null, accuracy },
  });
  const stars = accuracy >= PASS ? RECITE_STARS : 0;
  if (stars) await addStars(child.id, stars, `背诵《${title}》${accuracy}%`);
  return NextResponse.json({ accuracy, diff, stars, matched: scored.matched, total: scored.total });
}
