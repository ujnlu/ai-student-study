import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { StartPracticeButton } from "@/components/start-practice-button";
import { dueReviews } from "@/lib/practice";
import { chapterPath, currentChapter } from "@/lib/sync";

const KIND: Record<string, string> = { oral: "口算", sync: "同步练", variant: "变式题", review: "复习", ai: "老师布置", pk: "PK", unit: "单元测" };

export default async function PracticePage() {
  const { child } = await requireChild();
  const hasChinese = child.textbooks.some((t) => t.subjectId === "chinese");
  const [ready, recent, due, mathCh, cnCh] = await Promise.all([
    db.practiceSet.findMany({ where: { childId: child.id, status: "ready" }, orderBy: { createdAt: "desc" }, include: { knowledgePoint: true } }),
    db.practiceSet.findMany({ where: { childId: child.id, status: "done" }, orderBy: { completedAt: "desc" }, take: 8 }),
    dueReviews(child.id),
    currentChapter(child.id, "math"),
    hasChinese ? currentChapter(child.id, "chinese") : null,
  ]);
  const mathLesson = mathCh ? (await chapterPath(mathCh.id)).split(" › ").pop() : null;
  const cnLesson = cnCh ? (await chapterPath(cnCh.id)).split(" › ").pop() : null;

  return (
    <div className="space-y-6">
      <h1 className="h-display text-2xl">🧮 练习</h1>

      <section className="card border-sky/30 bg-gradient-to-br from-sky-soft to-white">
        <div className="flex items-start gap-3">
          <span className="text-4xl">📚</span>
          <div className="flex-1">
            <h2 className="h-display text-xl">同步练习</h2>
            <p className="text-sm font-bold text-muted">跟着学校进度出题，8 题一组，从易到难。<Link href="/child/progress" className="text-sky underline ml-1">学到哪一课？</Link></p>
          </div>
        </div>
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          <div className="card-flat flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-black">数学</p>
              <p className="text-xs font-bold text-muted truncate">{mathLesson ?? "还没设置进度"}</p>
            </div>
            <StartPracticeButton kind="sync" subjectId="math" label="开始" className="btn-sky text-sm py-2" />
          </div>
          {hasChinese && (
            <div className="card-flat flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-black">语文</p>
                <p className="text-xs font-bold text-muted truncate">{cnLesson ?? "还没设置进度"}</p>
              </div>
              <StartPracticeButton kind="sync" subjectId="chinese" label="开始" className="btn-secondary text-sm py-2" />
            </div>
          )}
        </div>
      </section>

      <section className="card border-brand/30 bg-gradient-to-br from-brand-soft to-white">
        <div className="flex items-start gap-3">
          <span className="text-4xl">⏱️</span>
          <div className="flex-1">
            <h2 className="h-display text-xl">口算天天练</h2>
            <p className="text-sm font-bold text-muted">按 {child.grade} 年级{child.semester === 1 ? "上" : "下"}学期出题，答一题判一题。</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <StartPracticeButton kind="oral" count={10} timeLimitSec={180} label="10 题 · 3 分钟" />
          <StartPracticeButton kind="oral" count={20} timeLimitSec={300} label="20 题 · 5 分钟" className="btn-secondary" />
          <StartPracticeButton kind="oral" count={30} timeLimitSec={null} label="30 题 · 不限时" className="btn-secondary" />
          <Link href="/child/pk" className="btn-danger">⚔️ 和橙橙 PK</Link>
        </div>
      </section>

      <div className="grid sm:grid-cols-3 gap-3">
        <Link href="/child/unit-test" className="tile flex-col items-start border-bee/40 bg-bee-soft"><span className="text-3xl">📝</span><span className="font-black">单元测试</span><span className="text-xs font-bold text-muted">15 题 · 20 分钟</span></Link>
        <Link href="/child/dictation" className="tile flex-col items-start border-grape/30 bg-grape-soft"><span className="text-3xl">✍️</span><span className="font-black">语文听写</span><span className="text-xs font-bold text-muted">橙橙读，你来写</span></Link>
        <Link href="/child/recite" className="tile flex-col items-start border-leaf/30 bg-leaf-soft"><span className="text-3xl">📖</span><span className="font-black">背古诗课文</span><span className="text-xs font-bold text-muted">背给橙橙听</span></Link>
      </div>

      {due.length > 0 && (
        <section>
          <h2 className="h-display text-xl mb-2">🔁 今天要复习的错题（{due.length}）</h2>
          <ul className="space-y-2">
            {due.map((m) => (
              <li key={m.id} className="tile py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-extrabold truncate">{m.problem.stem}</p>
                  <p className="text-xs font-bold text-muted">第 {m.reviewCount + 1} 次复习 {m.problem.knowledgePoint ? `· ${m.problem.knowledgePoint.name}` : ""}</p>
                </div>
                <StartPracticeButton kind="review" mistakeId={m.id} label="复习 2 题" className="btn-leaf text-sm py-2" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {ready.length > 0 && (
        <section>
          <h2 className="h-display text-xl mb-2">📌 没做完的</h2>
          <ul className="space-y-2">
            {ready.map((s) => (
              <li key={s.id}>
                <Link href={`/child/practice/${s.id}`} className="tile py-3">
                  <span className="badge bg-sky-soft text-sky-dark">{KIND[s.kind] ?? s.kind}</span>
                  <span className="flex-1 font-extrabold truncate">{s.title}</span>
                  <span className="text-sm font-bold text-muted">{s.total} 题</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="h-display text-xl mb-2">🏁 最近完成</h2>
        {recent.length === 0 ? <p className="text-sm font-bold text-muted">还没有做过练习，从上面挑一个开始吧！</p> : (
          <ul className="space-y-2">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={`/child/practice/${s.id}`} className="tile py-3">
                  <span className="badge bg-gray-100 text-muted">{KIND[s.kind] ?? s.kind}</span>
                  <span className="flex-1 font-extrabold truncate">{s.title}</span>
                  <span className={`font-black ${s.score === s.total ? "text-leaf" : ""}`}>{s.score}/{s.total}</span>
                  <span className="text-xs font-bold text-muted">{s.completedAt?.toLocaleDateString("zh-CN")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
