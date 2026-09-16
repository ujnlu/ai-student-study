import Link from "next/link";
import { requireChild } from "@/lib/auth";
import { levelProgress, olympiadLevel, MODULES } from "@/lib/topics";
import { levelTestResults, LEVEL_PASS, LEVEL_TEST_SIZE, LEVEL_TEST_SECONDS } from "@/lib/level-test";
import { StartFlowButton } from "@/components/start-flow-button";
import { MascotSays } from "@/components/mascot";
import { THEME } from "@/components/subject-ui";

const GRADE_TEXT = ["", "一年级", "二年级", "三年级", "四年级", "五年级", "六年级"];
const OLY_MODULES = ["calc", "number", "geometry", "word", "motion", "combo", "counting", "mixed"];

export default async function OlympiadPage({ searchParams }: { searchParams: Promise<{ level?: string; m?: string }> }) {
  const { child } = await requireChild();
  const { level: lv, m } = await searchParams;
  const mine = olympiadLevel(child.grade, child.semester);
  const level = Math.min(12, Math.max(1, Number(lv) || mine));
  const grade = Math.ceil(level / 2);
  const sem = level % 2 === 1 ? "上" : "下";
  const [{ lectures, stats, lecturedSet, practiced, mastered }, tests] = await Promise.all([levelProgress(child.id, level), levelTestResults(child.id)]);
  const testBest = tests.get(level);
  const filtered = m && MODULES[m] ? lectures.filter((t) => t.module === m) : lectures;
  const T = THEME.olympiad;
  const nextUp = lectures.find((t) => !(stats.get(t.code)?.sets ?? 0));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="h-display text-2xl">🧠 小学奥数 · 12 级体系</h1>
        <div className="flex gap-1">
          <Link href="/child/olympiad/tree" className="btn-ghost text-sm">🌳 知识树</Link>
          <Link href="/child?s=olympiad" className="btn-ghost text-sm">‹ 回首页</Link>
        </div>
      </div>
      <MascotSays mood="think" size={80}>
        <p className="font-extrabold">每个年级分上下两级、每级 20 讲，按计算 / 整数 / 图形 / 应用 / 行程 / 组合 / 计数 / 综合八类。每讲先「讲一讲」，再做 ★ ★★ ★★★ 三档「练一练」。</p>
        <p className="text-xs text-muted mt-1">{level === mine ? "这是你现在这学期对应的级" : level < mine ? "回头看看前面的级也很好" : "后面的级会难一些，量力而行"}</p>
      </MascotSays>

      {/* 级选择：每年级两级 */}
      <div className="grid grid-cols-6 gap-1.5">
        {[1, 2, 3, 4, 5, 6].map((g) => (
          <div key={g} className="flex flex-col gap-1">
            <p className="text-[10px] font-extrabold text-muted text-center">{GRADE_TEXT[g]}</p>
            {[g * 2 - 1, g * 2].map((l) => {
              const passed = (tests.get(l) ?? 0) >= LEVEL_PASS;
              return (
                <Link key={l} href={`/child/olympiad?level=${l}`} className={`rounded-xl border-2 text-center text-xs font-black py-1.5 ${l === level ? `${T.ring} ${T.soft} ${T.text}` : passed ? "border-leaf/40 bg-leaf-soft text-leaf-dark" : l === mine ? "border-bee/40 bg-white" : "border-line bg-white text-muted"}`}>
                  {passed ? "✓ " : ""}{l} 级
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <section className={`card ${T.border} bg-gradient-to-br ${T.soft} to-white`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="h-display text-xl">第 {level} 级 · {GRADE_TEXT[grade]}{sem}学期</h2>
            <p className="text-sm font-bold text-muted">{lectures.length} 讲 · 讲过 {lecturedSet.size} · 练过 {practiced} · 掌握 {mastered}</p>
          </div>
          {nextUp && <Link href={`/child/topic/${nextUp.code}`} className={`${T.btn} text-sm`}>继续：第 {nextUp.no} 讲 {nextUp.name} ➡️</Link>}
        </div>
        <div className="bar mt-3"><div className="bar-fill bg-bee" style={{ width: `${Math.round((mastered / Math.max(1, lectures.length)) * 100)}%` }} /></div>
        <div className="mt-3 flex items-center gap-3 flex-wrap rounded-2xl bg-white/70 p-3">
          <span className="text-2xl">🏁</span>
          <div className="flex-1 min-w-0">
            <p className="font-black">级末定级测</p>
            <p className="text-xs font-bold text-muted">{LEVEL_TEST_SIZE} 题 · {Math.round(LEVEL_TEST_SECONDS / 60)} 分钟 · 跨 20 讲 · {LEVEL_PASS}% 通关{testBest !== undefined ? ` · 最好 ${testBest}%${testBest >= LEVEL_PASS ? " ✓ 已通关" : ""}` : ""}</p>
          </div>
          <StartFlowButton url="/api/level-test" body={{ level }} redirect="/child/practice/{id}" label={testBest !== undefined ? "再测一次" : "开始定级测"} busyLabel="正在组卷…" className={`${testBest !== undefined && testBest >= LEVEL_PASS ? "btn-secondary" : T.btn} text-sm`} />
        </div>
      </section>

      <div className="flex gap-2 flex-wrap">
        <Link href={`/child/olympiad?level=${level}`} className={!m ? "chip-on" : "chip"}>全部</Link>
        {OLY_MODULES.map((k) => (
          <Link key={k} href={`/child/olympiad?level=${level}&m=${k}`} className={m === k ? "chip-on" : "chip"}>{MODULES[k].emoji} {MODULES[k].name}</Link>
        ))}
      </div>

      <ul className="space-y-2">
        {filtered.map((t) => {
          const st = stats.get(t.code);
          const done = (st?.sets ?? 0) > 0;
          const mastered = (st?.best ?? 0) >= 90;
          const tiers = st?.tiers ?? {};
          return (
            <li key={t.code}>
              <Link href={`/child/topic/${t.code}`} className={`tile py-2.5 ${mastered ? "border-leaf/40 bg-leaf-soft/40" : "border-line"}`}>
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${mastered ? "bg-leaf text-white" : done ? `${T.solid} text-gray-900` : "bg-gray-100 text-muted"}`}>{mastered ? "✓" : t.no}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-extrabold truncate">{t.name}</p>
                  <p className="text-xs font-bold text-muted">{MODULES[t.module]?.emoji} {t.moduleName}{lecturedSet.has(t.code) ? " · 已讲" : ""}{st ? ` · 最好 ${st.best}%` : ""}</p>
                </div>
                <span className="flex gap-1 text-[10px] font-extrabold">
                  {(["basic", "advanced", "challenge"] as const).map((k, i) => {
                    const v = tiers[k];
                    return <span key={k} className={`px-1.5 rounded-full ${v === undefined ? "bg-gray-100 text-gray-400" : v >= 90 ? "bg-leaf text-white" : "bg-bee-soft text-bee-dark"}`}>{"★".repeat(i + 1)}</span>;
                  })}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
