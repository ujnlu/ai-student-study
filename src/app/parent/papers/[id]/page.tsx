import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { getOrCreateAdultLearner } from "@/lib/adult";
import { PAPER_STAGES, paperCode } from "@/lib/papers";
import { SUBJECT_NAME, type TopicSubject } from "@/lib/topics";
import { PaperStatus } from "@/components/paper-status";
import { StartFlowButton } from "@/components/start-flow-button";
import { WalkthroughBox } from "@/components/walkthrough-box";

const KIND: Record<string, string> = { choice: "选择", fill: "填空", subjective: "解答" };

export default async function PaperDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireParent();
  const { id } = await params;
  const paper = await db.paper.findFirst({ where: { id, familyId: s.familyId } });
  if (!paper) notFound();
  const learner = await getOrCreateAdultLearner(s.familyId);
  const [problems, pending, done, children] = await Promise.all([
    db.problem.findMany({ where: { topic: paperCode(id) }, orderBy: { index: "asc" } }),
    db.practiceSet.findFirst({ where: { childId: learner.id, topic: paperCode(id), status: "ready" } }),
    db.practiceSet.findMany({ where: { topic: paperCode(id), status: "done" }, include: { child: { select: { name: true } } }, orderBy: { completedAt: "desc" }, take: 10 }),
    db.child.findMany({ where: { familyId: s.familyId, kind: "child" }, select: { name: true, grade: true } }),
  ]);
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500"><Link href="/parent/papers" className="hover:underline">‹ 真题卷</Link></p>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">📄 {paper.title}</h1>
          <p className="text-sm text-gray-500">{PAPER_STAGES[paper.stage] ?? paper.stage} · {SUBJECT_NAME[paper.subject as TopicSubject] ?? paper.subject}{paper.year ? ` · ${paper.year}` : ""} · {paper.total} 题 · {paper.minutes} 分钟 · 来源 {paper.source}</p>
        </div>
        <PaperStatus id={paper.id} status={paper.status} />
      </div>
      {paper.status === "failed" && <div className="card border-berry/40 bg-berry-soft/40 text-sm text-berry-dark">解析失败：{paper.error}</div>}
      {paper.status === "ready" && (
        <section className="card flex items-center gap-3 flex-wrap">
          <span className="text-3xl">🚀</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold">整卷做题（家长自己做）</p>
            <p className="text-xs text-gray-500">按原卷顺序、限时 {paper.minutes} 分钟；选择填空自动判分，解答题对照参考答案自评；孩子在孩子端「真题演练」里也能做这份卷{children.length ? `（${children.map((c) => c.name).join("、")}）` : ""}。</p>
          </div>
          {pending ? <Link href={`/parent/study/practice/${pending.id}`} className="btn-primary">继续做卷 ➡️</Link> : <StartFlowButton url="/api/exam" body={{ paperId: paper.id }} redirect="/parent/study/practice/{id}" label="开始做卷" className="btn-primary" />}
        </section>
      )}
      {done.length > 0 && (
        <section className="card">
          <h2 className="font-bold mb-2">做卷记录</h2>
          <ul className="divide-y divide-line text-sm">
            {done.map((x) => (
              <li key={x.id} className="py-2 flex items-center gap-3">
                <span className="flex-1">{x.child.name} · {x.completedAt?.toLocaleString("zh-CN")}</span>
                <span className="font-bold">{x.score}/{x.total}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {problems.length > 0 && (
        <section>
          <h2 className="font-bold text-lg mb-2">题目（{problems.length}）</h2>
          <ol className="space-y-2">
            {problems.map((p) => (
              <li key={p.id} className="card-flat">
                <p className="text-xs text-gray-500 mb-1">{p.index + 1}. {KIND[p.kind ?? ""] ?? ""} · {p.solution?.match(/^【([^】]+)】/)?.[1] ?? ""} · 难度 {"★".repeat(Math.max(1, Math.min(5, p.difficulty)))}</p>
                <p className="font-semibold whitespace-pre-wrap">{p.stem}</p>
                <p className="text-sm text-gray-600 mt-1">答案：<b className="text-leaf-dark">{p.answer}</b></p>
                {p.solution && <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{p.solution.replace(/^【[^】]+】/, "")}</p>}
                <div className="mt-2"><WalkthroughBox problemId={p.id} childId={learner.id} initial={p.walkthrough} className="btn-ghost text-xs py-1" /></div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
