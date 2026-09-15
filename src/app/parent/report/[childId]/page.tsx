import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { buildReport } from "@/lib/report";
import { WeeklySummary } from "@/components/weekly-summary";

const ERR: Record<string, string> = { concept: "概念不清", calculation: "计算错误", reading: "审题错误", careless: "粗心笔误", unknown: "未分类" };
const SUBJ: Record<string, string> = { math: "数学", chinese: "语文", english: "英语" };

export default async function ReportPage({ params }: { params: Promise<{ childId: string }> }) {
  const s = await requireParent();
  const { childId } = await params;
  const child = await db.child.findFirst({ where: { id: childId, familyId: s.familyId } });
  if (!child) notFound();
  const r = await buildReport(childId);
  const maxTotal = Math.max(1, ...r.daily.map((d) => d.total));
  const bar = (v: number) => (v >= 80 ? "bg-green-500" : v >= 60 ? "bg-yellow-400" : "bg-red-400");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-4xl">{child.avatar}</span>
        <div>
          <h1 className="text-2xl font-bold">{child.name} 的学情报告</h1>
          <p className="text-sm text-gray-500">{child.grade}年级{child.semester === 1 ? "上" : "下"}学期 · 连续学习 {r.streak} 天 · ⭐ {r.stars}</p>
        </div>
        <Link href={`/parent/children/${child.id}`} className="ml-auto btn-secondary text-sm">编辑档案</Link>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["本周作答", `${r.week.attempts} 题`, r.week.attempts ? `正确率 ${Math.round((r.week.correct / r.week.attempts) * 100)}%` : "还没作答"],
          ["本周练习", `${r.week.sets} 组`, `约 ${r.week.minutes} 分钟`],
          ["本周拍作业", `${r.week.uploads} 次`, `新增错题 ${r.week.newMistakes}`],
          ["待消灭错题", `${r.mistakesOpen} 道`, `本周消灭 ${r.week.cleared}`],
        ].map(([t, v, h]) => (
          <div key={t} className="card py-4">
            <p className="text-xs text-gray-500">{t}</p>
            <p className="text-2xl font-bold mt-1">{v}</p>
            <p className="text-xs text-gray-500">{h}</p>
          </div>
        ))}
      </section>

      <WeeklySummary childId={child.id} />

      <section className="card">
        <h2 className="font-semibold mb-3">最近 14 天每日正确率</h2>
        <div className="flex items-end gap-1 h-40">
          {r.daily.map((d) => (
            <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.day}：${d.total} 题${d.rate !== null ? `，正确率 ${d.rate}%` : ""}`}>
              {d.rate !== null ? (
                <div className={`w-full rounded-t ${bar(d.rate)}`} style={{ height: `${Math.max(8, d.rate)}%`, opacity: 0.5 + (d.total / maxTotal) * 0.5 }} />
              ) : (
                <div className="w-full h-1 bg-gray-200 rounded" />
              )}
              <span className="text-[10px] text-gray-400 mt-1">{d.day.slice(3)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">柱高 = 正确率，颜色深浅 = 题量。绿 ≥80%，黄 60-80%，红 &lt;60%。</p>
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold mb-3">薄弱知识点</h2>
          {r.weak.length === 0 ? <p className="text-sm text-gray-500">还没有明显薄弱点（需要至少作答 2 次且掌握度低于 60）。</p> : (
            <ul className="space-y-2">
              {r.weak.map((w) => (
                <li key={w.name} className="text-sm">
                  <div className="flex justify-between"><span>{w.name} <span className="text-gray-400 text-xs">{w.unit}</span></span><span className="text-red-600">{w.score}</span></div>
                  <div className="h-1.5 bg-gray-100 rounded mt-1"><div className="h-full bg-red-400 rounded" style={{ width: `${w.score}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <h2 className="font-semibold mb-3">错因分布（14 天）</h2>
          {r.errorTypes.length === 0 ? <p className="text-sm text-gray-500">没有错题记录。</p> : (
            <ul className="space-y-2 text-sm">
              {r.errorTypes.map(([k, v]) => {
                const total = r.errorTypes.reduce((a, [, n]) => a + n, 0);
                return (
                  <li key={k}>
                    <div className="flex justify-between"><span>{ERR[k] ?? k}</span><span>{v} 题</span></div>
                    <div className="h-1.5 bg-gray-100 rounded mt-1"><div className="h-full bg-orange-400 rounded" style={{ width: `${Math.round((v / total) * 100)}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-3">各单元掌握度</h2>
        {r.units.length === 0 ? <p className="text-sm text-gray-500">还没有作答数据。做几组同步练或拍几次作业后这里会出现各单元的掌握情况。</p> : (
          <div className="space-y-3">
            {r.units.map((u) => (
              <details key={`${u.subjectId}${u.grade}${u.semester}${u.unit}`} className="group">
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="badge bg-gray-100 text-gray-600">{SUBJ[u.subjectId] ?? u.subjectId} {u.grade}{u.semester === 1 ? "上" : "下"}</span>
                    <span className="flex-1 truncate">{u.unit}</span>
                    <span className="w-40 h-2 bg-gray-100 rounded overflow-hidden"><span className={`block h-full ${bar(u.avg)}`} style={{ width: `${u.avg}%` }} /></span>
                    <span className="w-8 text-right font-semibold">{u.avg}</span>
                  </div>
                </summary>
                <ul className="ml-4 mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600">
                  {u.kps.map((k) => <li key={k.name} className="flex justify-between"><span>{k.name}</span><span>{k.score}（{k.attempts} 次）</span></li>)}
                </ul>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
