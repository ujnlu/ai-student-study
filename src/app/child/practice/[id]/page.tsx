import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { PracticePlayer } from "@/components/practice-player";
import { ExplainButton } from "@/components/explain-button";
import { StartPracticeButton } from "@/components/start-practice-button";
import { existingExplanations } from "@/lib/explanations";

export default async function PracticeSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { child } = await requireChild();
  const { id } = await params;
  const set = await db.practiceSet.findFirst({
    where: { id, childId: child.id },
    include: { items: { include: { problem: true }, orderBy: { index: "asc" } }, mistake: true },
  });
  if (!set) notFound();
  if (set.status === "pending_review") return <div className="card">这组题还在等家长审核。</div>;

  if (set.status !== "done") {
    return <PracticePlayer setId={set.id} title={set.title} timeLimitSec={set.timeLimitSec} items={set.items.map((it) => ({ index: it.index, stem: it.problem.stem }))} />;
  }

  const wrong = set.items.filter((it) => !it.isCorrect);
  const perfect = wrong.length === 0;
  const explained = await existingExplanations(child.familyId, wrong.map((it) => ({ id: it.problemId, stem: it.problem.stem, answer: it.problem.answer })));
  return (
    <div className="space-y-4">
      <div className={`card text-center py-8 ${perfect ? "bg-green-50 border-green-100" : "bg-orange-50 border-orange-100"}`}>
        <p className="text-5xl">{perfect ? "🏆" : wrong.length <= 2 ? "👍" : "💪"}</p>
        <p className="text-3xl font-bold mt-2">{set.score} / {set.total}</p>
        <p className="text-gray-600 mt-1">{perfect ? "全对！太厉害了！" : `错了 ${wrong.length} 题，看看讲解再试一次`}{set.durationSec ? ` · 用时 ${Math.floor(set.durationSec / 60)}分${set.durationSec % 60}秒` : ""}</p>
        {set.kind === "variant" && set.mistake && (
          <p className="mt-2 text-sm">{perfect ? "这道错题消灭了！过 1 天会再来复习一次。" : "还没完全掌握，再做一组试试。"}</p>
        )}
      </div>

      <ol className="space-y-2">
        {set.items.map((it) => (
          <li key={it.id} className={`card py-3 border-l-4 ${it.isCorrect ? "border-l-green-400" : "border-l-red-400"}`}>
            <div className="flex items-start gap-3">
              <span className={it.isCorrect ? "text-green-500" : "text-red-500"}>{it.isCorrect ? "✓" : "✗"}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium whitespace-pre-wrap">{it.index + 1}. {it.problem.stem}</p>
                <p className="text-sm text-gray-600">你答：<b className={it.isCorrect ? "" : "text-red-600"}>{it.childAnswer || "（没写）"}</b>{!it.isCorrect && <> · 正确：<b className="text-green-700">{it.problem.answer}</b></>}</p>
                {!it.isCorrect && it.problem.solution && <p className="text-xs text-gray-500 mt-1">{it.problem.solution}</p>}
                {!it.isCorrect && <div className="mt-2"><ExplainButton problemId={it.problemId} existingId={explained.get(it.problemId)} className="btn-secondary text-xs py-1" /></div>}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex gap-2 flex-wrap justify-center">
        {set.kind === "oral" && <StartPracticeButton kind="oral" count={set.total} timeLimitSec={set.timeLimitSec} label="再来一组" />}
        {set.kind === "variant" && !perfect && set.mistakeId && <StartPracticeButton kind="variant" mistakeId={set.mistakeId} label="再做一组变式题" />}
        <Link href="/child/practice" className="btn-secondary">返回练习</Link>
        <Link href="/child" className="btn-secondary">回首页</Link>
      </div>
    </div>
  );
}
