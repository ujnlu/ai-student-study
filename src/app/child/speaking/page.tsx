import Link from "next/link";
import { requireChild } from "@/lib/auth";
import { db } from "@/lib/db";
import { speakTopicsFor } from "@/lib/speaking";
import { currentTextbook, lessonChapters } from "@/lib/sync";
import { MascotSays } from "@/components/mascot";

export default async function SpeakingHub({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { child } = await requireChild();
  const { tab } = await searchParams;
  const topics = speakTopicsFor(child.grade);
  const [tb, recent] = await Promise.all([
    child.textbooks.some((t) => t.subjectId === "english") ? currentTextbook(child.id, "english") : null,
    db.recitation.findMany({ where: { childId: child.id, kind: "speaking" }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const best = new Map<string, number>();
  for (const r of recent) best.set(r.text, Math.max(best.get(r.text) ?? 0, r.accuracy));
  const lessons = tb ? lessonChapters(tb.chapters) : [];
  const unitOf = (c: { parentId: string | null }) => (tb ? tb.chapters.find((x) => x.id === c.parentId)?.title ?? "" : "");
  const showBook = tab === "book" && lessons.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="h-display text-2xl">🗣️ 英语口语</h1>
        <Link href="/child?s=english" className="btn-ghost text-sm">‹ 回首页</Link>
      </div>

      <Link href="/child/speaking/chat" className="tile border-2 border-sky bg-gradient-to-br from-sky-soft to-white py-4 hover:-translate-y-0.5">
        <span className="text-5xl">💬</span>
        <div className="flex-1">
          <p className="h-display text-xl">和橙橙聊英语</p>
          <p className="text-sm font-bold text-muted">按住麦克风说，或者打字。橙橙用简单的英语回你，还会告诉你中文意思。</p>
        </div>
        <span className="btn-sky">开聊</span>
      </Link>

      <MascotSays mood="happy" size={72}>
        <p className="font-extrabold">跟读打分：先听橙橙读一遍，再自己读，读到 80% 以上就能拿星星！</p>
        <p className="text-xs text-muted mt-1">需要用 Chrome / Edge 浏览器并允许麦克风</p>
      </MascotSays>

      {lessons.length > 0 && (
        <div className="flex gap-2">
          <Link href="/child/speaking" className={!showBook ? "chip-on" : "chip"}>🎨 按主题</Link>
          <Link href="/child/speaking?tab=book" className={showBook ? "chip-on" : "chip"}>📖 跟着课本</Link>
        </div>
      )}

      {showBook ? (
        <ul className="space-y-2">
          {lessons.map((l) => {
            const code = `ch-${l.id}`;
            const b = best.get(code);
            return (
              <li key={l.id}>
                <Link href={`/child/speaking/${code}`} className="tile py-3">
                  <span className="text-2xl">📖</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold truncate">{l.title}</p>
                    <p className="text-xs font-bold text-muted truncate">{unitOf(l)}</p>
                  </div>
                  {b !== undefined ? <span className={`badge ${b >= 80 ? "bg-leaf text-white" : "bg-bee-soft text-bee-dark"}`}>{b}%</span> : <span className="text-muted">›</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {topics.map((t) => {
            const b = best.get(t.code);
            return (
              <Link key={t.code} href={`/child/speaking/${t.code}`} className={`tile flex-col items-start gap-1 border-2 py-3 hover:-translate-y-0.5 ${b !== undefined && b >= 80 ? "border-leaf/40 bg-leaf-soft/50" : "border-sky/30 bg-white"}`}>
                <div className="flex items-center gap-2 w-full">
                  <span className="text-2xl">{t.emoji}</span>
                  <span className="font-black flex-1 truncate">{t.name}</span>
                  {b !== undefined && <span className={`badge ${b >= 80 ? "bg-leaf text-white" : "bg-bee-soft text-bee-dark"}`}>{b >= 80 ? "✓" : `${b}%`}</span>}
                </div>
                <span className="text-xs font-bold text-muted line-clamp-1">{t.desc}</span>
              </Link>
            );
          })}
        </div>
      )}

      {recent.length > 0 && (
        <section>
          <h2 className="font-black text-lg mb-2">🏁 最近的跟读</h2>
          <ul className="space-y-1.5">
            {recent.slice(0, 5).map((r) => (
              <li key={r.id} className="card-flat py-2.5 flex items-center gap-3">
                <span className="flex-1 font-extrabold truncate">{r.title}</span>
                <span className={`font-black ${r.accuracy >= 80 ? "text-leaf" : "text-bee-dark"}`}>{r.accuracy}%</span>
                <span className="text-xs font-bold text-muted">{r.createdAt.toLocaleDateString("zh-CN")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
