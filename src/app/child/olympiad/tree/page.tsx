import Link from "next/link";
import { requireChild } from "@/lib/auth";
import { allTopics, olympiadLevel, topicStats, MODULES } from "@/lib/topics";
import { MascotSays } from "@/components/mascot";

const OLY_MODULES = ["calc", "number", "geometry", "word", "motion", "combo", "counting", "mixed"];

/** 知识树（参考高思课本每讲的"知识树"）：八大模块 × 12 级，一眼看到哪些讲已掌握 */
export default async function OlympiadTreePage() {
  const { child } = await requireChild();
  const mine = olympiadLevel(child.grade, child.semester);
  const all = allTopics().filter((t) => t.track === "olympiad");
  const stats = await topicStats(child.id, all.map((t) => t.code));
  const mastered = all.filter((t) => (stats.get(t.code)?.best ?? 0) >= 90).length;
  const practiced = all.filter((t) => (stats.get(t.code)?.sets ?? 0) > 0).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="h-display text-2xl">🌳 奥数知识树</h1>
        <Link href="/child/olympiad" className="btn-ghost text-sm">‹ 回 12 级</Link>
      </div>
      <MascotSays mood="happy" size={72}>
        <p className="font-extrabold">八大问题各是一根枝，每一级的讲次是叶子。绿叶是掌握了的，黄叶练过了，灰叶还没碰。</p>
        <p className="text-xs text-muted mt-1">共 {all.length} 讲 · 练过 {practiced} · 掌握 {mastered}</p>
      </MascotSays>
      {OLY_MODULES.map((m) => {
        const list = all.filter((t) => t.module === m).sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || (a.no ?? 0) - (b.no ?? 0));
        const done = list.filter((t) => (stats.get(t.code)?.best ?? 0) >= 90).length;
        return (
          <section key={m} className="card">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-black text-lg">{MODULES[m].emoji} {MODULES[m].name}</h2>
              <span className="text-xs font-bold text-muted">{done}/{list.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {list.map((t) => {
                const st = stats.get(t.code);
                const ok = (st?.best ?? 0) >= 90;
                const tried = (st?.sets ?? 0) > 0;
                const cls = ok ? "border-leaf bg-leaf-soft text-leaf-dark" : tried ? "border-bee bg-bee-soft text-bee-dark" : (t.level ?? 0) <= mine ? "border-line bg-white text-foreground" : "border-dashed border-line bg-white text-muted/60";
                return (
                  <Link key={t.code} href={`/child/topic/${t.code}`} className={`rounded-lg border-2 px-2 py-1 text-xs font-extrabold ${cls}`} title={`第 ${t.level} 级第 ${t.no} 讲`}>
                    <span className="opacity-60 mr-1">L{t.level}</span>{t.name}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
