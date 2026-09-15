import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAny } from "@/lib/auth";
import { ExplainPlayer } from "@/components/explain-player";
import { ExplainButton } from "@/components/explain-button";
import type { ExplanationStep } from "@/lib/ai/explain";

export default async function ExplainPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireAny();
  const { id } = await params;
  const ex = await db.explanation.findFirst({
    where: { id, child: { familyId: s.familyId } },
    include: { problem: { include: { mistakes: { where: { childId: s.childId ?? undefined }, take: 1 } } }, child: true },
  });
  if (!ex) notFound();
  const steps = JSON.parse(ex.stepsJson) as ExplanationStep[];
  const back = s.role === "parent" ? "/parent" : "/child/mistakes";
  const mistake = ex.problem.mistakes[0];

  return (
    <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-5 space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <Link href={back} className="text-gray-500 hover:underline">← 返回</Link>
        <span className="text-gray-400">|</span>
        <span className="text-gray-600 truncate">题目：{ex.problem.stem}</span>
      </div>
      {ex.status === "failed" ? (
        <div className="card text-red-700">生成失败：{ex.error}</div>
      ) : (
        <ExplainPlayer title={ex.title} steps={steps} summary={ex.summary} quizQ={ex.quizQ} quizA={ex.quizA} />
      )}
      <div className="flex gap-2 flex-wrap justify-center pt-2">
        <ExplainButton problemId={ex.problemId} childId={ex.childId} label="🎨 换一种讲法" className="btn-secondary text-sm" force />
        {mistake && s.role === "child" && <Link href={`/child/mistakes/${mistake.id}`} className="btn-secondary text-sm">💬 和老师聊聊</Link>}
      </div>
    </main>
  );
}
