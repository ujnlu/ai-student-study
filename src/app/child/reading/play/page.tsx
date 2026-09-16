import Link from "next/link";
import { requireChild } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePiece } from "@/lib/reading";
import { ReadingPlayer } from "@/components/reading-player";

const pickOne = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export default async function ReadingPlayPage({ searchParams }: { searchParams: Promise<{ lang?: string; level?: string }> }) {
  const { child } = await requireChild();
  const { lang: l, level: lv } = await searchParams;
  const lang = l === "en" ? "en" : "zh";
  const level = Math.min(6, Math.max(1, Number(lv) || 1));
  // 有没读过的现成短文就直接带上，避免客户端再请求一次
  const read = new Set((await db.recitation.findMany({ where: { childId: child.id, kind: "reading" }, select: { text: true } })).map((r) => r.text));
  const pool = (await db.readingPiece.findMany({ where: { lang, level } })).filter((p) => !read.has(p.id));
  const initial = pool.length ? parsePiece(pickOne(pool)) : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="h-display text-2xl">{lang === "en" ? "📚 English Reading" : "📚 中文分级阅读"} · L{level}</h1>
        <Link href={`/child/reading?lang=${lang}`} className="btn-ghost text-sm">换级别</Link>
      </div>
      <ReadingPlayer lang={lang} level={level} initial={initial} />
    </div>
  );
}
