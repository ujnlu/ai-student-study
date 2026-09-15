import Link from "next/link";
import { requireChild } from "@/lib/auth";
import { db } from "@/lib/db";
import { consolidateInfo, CONSOLIDATE_SIZE, WEEKLY_SECONDS, WEEKLY_SIZE } from "@/lib/consolidate";
import { Mascot, MascotSays } from "@/components/mascot";
import { StartFlowButton } from "@/components/start-flow-button";

export default async function ReviewIntroPage() {
  const { child } = await requireChild();
  const subjectId = "math";
  const [info, pendingConsolidate, pendingWeekly, recent] = await Promise.all([
    consolidateInfo(child.id, subjectId).catch(() => ({ weakKps: [], recentLessons: [] })),
    db.practiceSet.findFirst({ where: { childId: child.id, kind: "consolidate", status: "ready" }, orderBy: { createdAt: "desc" } }),
    db.practiceSet.findFirst({ where: { childId: child.id, kind: "weekly", status: "ready" }, orderBy: { createdAt: "desc" } }),
    db.practiceSet.findMany({ where: { childId: child.id, kind: { in: ["consolidate", "weekly"] }, status: "done" }, orderBy: { completedAt: "desc" }, take: 6 }),
  ]);
  const hasWeak = info.weakKps.length > 0;
  const minutes = Math.round(WEEKLY_SECONDS / 60);
  const isWeekend = [0, 6].includes(new Date().getDay());

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-3xl h-display">🔁 加固复习</h1>
        <Link href="/child/progress" className="btn-ghost text-sm">调整学到哪一课 ›</Link>
      </div>
      <MascotSays mood={hasWeak ? "think" : "happy"}>
        {hasWeak
          ? `橙橙发现有 ${info.weakKps.length} 个知识点还不太熟，咱们专门练一练，把它们变成拿手的！`
          : isWeekend
            ? "周末啦！把这周学的都过一遍，橙橙陪你一起复习～"
            : "最近学得很扎实！做一组巩固练热热身，周末再来一次总复习吧。"}
      </MascotSays>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 薄弱巩固练 */}
        <section className="tile flex-col items-stretch gap-3 border-leaf/40 bg-gradient-to-br from-leaf-soft via-white to-white">
          <div className="flex items-center gap-3">
            <Mascot mood="think" size={72} />
            <div>
              <h2 className="text-2xl h-display">💪 薄弱巩固练</h2>
              <p className="text-sm font-bold text-muted">{CONSOLIDATE_SIZE} 题 · 不限时 · 专攻不熟的知识点</p>
            </div>
          </div>
          {hasWeak ? (
            <div>
              <p className="text-xs font-bold text-muted mb-1.5">这几个知识点要加油：</p>
              <div className="flex flex-wrap gap-2">
                {info.weakKps.map((k) => (
                  <span key={k.name} className={`chip ${k.score < 40 ? "border-berry/40 bg-berry-soft text-berry-dark" : "border-bee/40 bg-bee-soft text-bee-dark"}`}>
                    {k.name} <span className="text-xs opacity-70">{k.score}分</span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="font-bold text-leaf-dark bg-white/70 rounded-2xl px-3 py-2">🎉 暂时没有薄弱知识点，会用当前学的这一课来出题。</p>
          )}
          <StartFlowButton
            url="/api/consolidate"
            body={{ kind: "consolidate", subjectId }}
            redirect="/child/practice/{id}"
            label={pendingConsolidate ? "继续巩固练 ➡️" : "开始巩固练 🚀"}
            busyLabel="橙橙在挑题，可能要等 30 秒…"
            className="btn-leaf text-xl py-4 w-full"
          />
        </section>

        {/* 周末总复习 */}
        <section className="tile flex-col items-stretch gap-3 border-sky/40 bg-gradient-to-br from-sky-soft via-white to-white">
          <div className="flex items-center gap-3">
            <Mascot mood="cheer" size={72} />
            <div>
              <h2 className="text-2xl h-display">📅 周末总复习</h2>
              <p className="text-sm font-bold text-muted">{WEEKLY_SIZE} 题 · 限时 {minutes} 分钟 · 这周学的都过一遍</p>
            </div>
          </div>
          {info.recentLessons.length > 0 ? (
            <div>
              <p className="text-xs font-bold text-muted mb-1.5">会复习这些课：</p>
              <ul className="flex flex-wrap gap-2">
                {info.recentLessons.map((t) => (
                  <li key={t} className="badge bg-sky-soft text-sky-dark normal-case tracking-normal text-sm py-1">📖 {t}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="font-bold text-muted bg-white/70 rounded-2xl px-3 py-2">还没有导入数学教材，请先让爸爸妈妈在家长端「教材」页导入。</p>
          )}
          <StartFlowButton
            url="/api/consolidate"
            body={{ kind: "weekly", subjectId }}
            redirect="/child/practice/{id}"
            label={pendingWeekly ? "继续总复习 ➡️" : "开始总复习 🚀"}
            busyLabel="橙橙在组卷，可能要等 30 秒…"
            className="btn-sky text-xl py-4 w-full"
          />
        </section>
      </div>

      <section className="card">
        <h2 className="text-xl h-display mb-3">📜 小提示</h2>
        <ul className="space-y-2 font-bold text-[15px]">
          <li className="flex gap-2"><span>💪</span><span>巩固练专挑掌握度不到 70 分的知识点，做对了分数就会涨上去。</span></li>
          <li className="flex gap-2"><span>📅</span><span>总复习限时 {minutes} 分钟，时间到会自动交卷，没写的算错。</span></li>
          <li className="flex gap-2"><span>🎬</span><span>做错的题会进错题本，可以看动画讲解，再做变式题消灭它。</span></li>
          <li className="flex gap-2"><span>⭐</span><span>每答对 1 题 +1 星，全对再 +10 星！</span></li>
        </ul>
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="font-extrabold mb-2">最近的复习</h2>
          <ul className="space-y-2">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={`/child/practice/${s.id}`} className="card-flat flex items-center gap-3 hover:shadow-md">
                  <span className={`badge ${s.kind === "weekly" ? "bg-sky-soft text-sky-dark" : "bg-leaf-soft text-leaf-dark"}`}>{s.kind === "weekly" ? "总复习" : "巩固"}</span>
                  <span className="flex-1 truncate font-bold">{s.title}</span>
                  <span className={`font-extrabold ${s.score === s.total ? "text-leaf" : ""}`}>{s.score}/{s.total}</span>
                  <span className="text-xs text-muted">{s.completedAt?.toLocaleDateString("zh-CN")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
