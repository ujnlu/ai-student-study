import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { defaultLevel, READING_LEVELS } from "@/lib/reading";
import { MascotSays } from "@/components/mascot";

export default async function ReadingHub({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { child } = await requireChild();
  const { lang: l } = await searchParams;
  const lang = l === "en" ? "en" : "zh";
  const mine = defaultLevel(child.grade, lang);
  const recent = await db.recitation.findMany({ where: { childId: child.id, kind: "reading" }, orderBy: { createdAt: "desc" }, take: 60 });
  const byLevel = new Map<number, { n: number; best: number }>();
  for (const r of recent) {
    const m = /分级阅读 L(\d)/.exec(r.title);
    if (!m) continue;
    const isEn = r.title.startsWith("英文");
    if ((lang === "en") !== isEn) continue;
    const lv = Number(m[1]);
    const cur = byLevel.get(lv) ?? { n: 0, best: 0 };
    cur.n++;
    cur.best = Math.max(cur.best, r.accuracy);
    byLevel.set(lv, cur);
  }
  const theme = lang === "en" ? { soft: "bg-sky-soft", border: "border-sky/30", text: "text-sky-dark", ring: "border-sky" } : { soft: "bg-grape-soft", border: "border-grape/30", text: "text-grape", ring: "border-grape" };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="h-display text-2xl">📚 分级阅读</h1>
        <Link href={`/child?s=${lang === "en" ? "english" : "chinese"}`} className="btn-ghost text-sm">‹ 回首页</Link>
      </div>
      <div className="flex gap-2">
        <Link href="/child/reading?lang=zh" className={lang === "zh" ? "chip-on border-grape bg-grape-soft text-grape" : "chip"}>📖 中文</Link>
        <Link href="/child/reading?lang=en" className={lang === "en" ? "chip-on border-sky bg-sky-soft text-sky-dark" : "chip"}>🔤 English</Link>
      </div>
      <MascotSays mood="happy" size={72}>
        <p className="font-extrabold">像 RAZ 一样一级一级往上读：先听橙橙读，再自己读给橙橙听（打分），最后答 3 道题。全对给 6 颗星。</p>
        <p className="text-xs text-muted mt-1">推荐从 L{mine} 开始，读顺了就升一级</p>
      </MascotSays>
      <div className="grid gap-2 sm:grid-cols-2">
        {[1, 2, 3, 4, 5, 6].map((lv) => {
          const st = byLevel.get(lv);
          const spec = READING_LEVELS[lv];
          return (
            <Link key={lv} href={`/child/reading/play?lang=${lang}&level=${lv}`} className={`tile py-3 border-2 hover:-translate-y-0.5 ${lv === mine ? `${theme.ring} ${theme.soft}` : "border-line bg-white"}`}>
              <span className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 ${st && st.best >= 80 ? "bg-leaf text-white" : `${theme.soft} ${theme.text}`}`}>L{lv}</span>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold">{lang === "en" ? `Level ${lv}` : `第 ${lv} 级`}{lv === mine && <span className="badge bg-brand text-white ml-2">推荐</span>}</p>
                <p className="text-xs font-bold text-muted line-clamp-1">{lang === "en" ? spec.en : spec.zh}</p>
                {st && <p className="text-xs font-bold text-muted">读过 {st.n} 篇 · 最好 {st.best}%</p>}
              </div>
              <span className="text-muted">›</span>
            </Link>
          );
        })}
      </div>
      {recent.length > 0 && (
        <section>
          <h2 className="font-black text-lg mb-2">🏁 最近读过</h2>
          <ul className="space-y-1.5">
            {recent.slice(0, 6).map((r) => (
              <li key={r.id} className="card-flat py-2.5 flex items-center gap-3">
                <span className="flex-1 font-extrabold truncate">{r.title}</span>
                <span className="text-xs font-bold text-muted">{r.transcript}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
