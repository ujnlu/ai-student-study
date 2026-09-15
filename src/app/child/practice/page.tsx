import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { StartPracticeButton } from "@/components/start-practice-button";
import { dueReviews } from "@/lib/practice";

export default async function PracticePage() {
  const { child } = await requireChild();
  const [ready, recent, due] = await Promise.all([
    db.practiceSet.findMany({ where: { childId: child.id, status: "ready" }, orderBy: { createdAt: "desc" }, include: { knowledgePoint: true } }),
    db.practiceSet.findMany({ where: { childId: child.id, status: "done" }, orderBy: { completedAt: "desc" }, take: 10 }),
    dueReviews(child.id),
  ]);
  const KIND: Record<string, string> = { oral: "口算", sync: "同步练", variant: "变式题", review: "复习", ai: "老师布置" };
  return (
    <div className="space-y-6">
      <section className="card bg-gradient-to-br from-blue-50 to-white border-blue-100">
        <h1 className="text-xl font-bold mb-1">📚 同步练习</h1>
        <p className="text-sm text-gray-600 mb-3">跟着学校进度出题，8 题一组，从易到难。<Link href="/child/progress" className="underline">调整学到哪一课</Link></p>
        <div className="flex flex-wrap gap-2">
          <StartPracticeButton kind="sync" subjectId="math" label="数学同步练" />
          <StartPracticeButton kind="sync" subjectId="chinese" label="语文同步练" className="btn-secondary" />
        </div>
      </section>

      <section className="card">
        <h1 className="text-xl font-bold mb-2">🧮 口算天天练</h1>
        <p className="text-sm text-gray-600 mb-3">按 {child.grade} 年级{child.semester === 1 ? "上" : "下"}学期的进度出题，每天一组。</p>
        <div className="flex flex-wrap gap-2">
          <StartPracticeButton kind="oral" count={10} timeLimitSec={180} label="10 题 · 3 分钟" />
          <StartPracticeButton kind="oral" count={20} timeLimitSec={300} label="20 题 · 5 分钟" />
          <StartPracticeButton kind="oral" count={30} timeLimitSec={null} label="30 题 · 不限时" className="btn-secondary" />
        </div>
      </section>

      {due.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2">🔁 今天要复习的错题（{due.length}）</h2>
          <ul className="space-y-2">
            {due.map((m) => (
              <li key={m.id} className="card py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="truncate">{m.problem.stem}</p>
                  <p className="text-xs text-gray-500">第 {m.reviewCount + 1} 次复习 {m.problem.knowledgePoint ? `· ${m.problem.knowledgePoint.name}` : ""}</p>
                </div>
                <StartPracticeButton kind="review" mistakeId={m.id} label="复习 2 题" className="btn-primary text-sm" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {ready.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2">📝 待完成的练习</h2>
          <ul className="space-y-2">
            {ready.map((s) => (
              <li key={s.id}>
                <Link href={`/child/practice/${s.id}`} className="card py-3 flex items-center gap-3 hover:shadow-md">
                  <span className="badge bg-blue-50 text-blue-700">{KIND[s.kind] ?? s.kind}</span>
                  <span className="flex-1 truncate">{s.title}</span>
                  <span className="text-sm text-gray-500">{s.total} 题</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-semibold mb-2">最近完成</h2>
        {recent.length === 0 ? <p className="text-sm text-gray-500">还没有做过练习</p> : (
          <ul className="space-y-2">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={`/child/practice/${s.id}`} className="card py-3 flex items-center gap-3 hover:shadow-md">
                  <span className="badge bg-gray-100 text-gray-600">{KIND[s.kind] ?? s.kind}</span>
                  <span className="flex-1 truncate">{s.title}</span>
                  <span className={`font-semibold ${s.score === s.total ? "text-green-600" : "text-gray-700"}`}>{s.score}/{s.total}</span>
                  <span className="text-xs text-gray-400">{s.completedAt?.toLocaleDateString("zh-CN")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
