import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { PracticePlayer } from "@/components/practice-player";
import { MathText } from "@/components/math-text";
import { ExplainButton } from "@/components/explain-button";
import { StartPracticeButton } from "@/components/start-practice-button";
import { existingExplanations } from "@/lib/explanations";
import { Mascot } from "@/components/mascot";
import { ResultFx } from "@/components/result-fx";
import { WalkthroughBox } from "@/components/walkthrough-box";
import { LEVEL_PASS } from "@/lib/level-test";

export default async function PracticeSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { child } = await requireChild();
  const { id } = await params;
  const set = await db.practiceSet.findFirst({
    where: { id, childId: child.id },
    include: { items: { include: { problem: true }, orderBy: { index: "asc" } }, mistake: true },
  });
  if (!set) notFound();
  if (set.status === "pending_review") return <div className="card font-bold">这组题还在等爸爸妈妈审核。</div>;

  if (set.status !== "done") {
    return <PracticePlayer setId={set.id} title={set.title} timeLimitSec={set.timeLimitSec} subjectId={set.items[0]?.problem.subjectId ?? "math"} items={set.items.map((it) => ({ index: it.index, stem: it.problem.stem, kind: it.problem.kind, answer: it.problem.kind === "subjective" ? it.problem.answer : null, multi: /^[A-D]{2,4}$/.test((it.problem.answer ?? "").trim()) }))} />;
  }

  const wrong = set.items.filter((it) => !it.isCorrect);
  const perfect = wrong.length === 0 && set.items.length > 0;
  const rate = set.total ? Math.round(((set.score ?? 0) / set.total) * 100) : 0;
  const explained = await existingExplanations(child.familyId, wrong.map((it) => ({ id: it.problemId, stem: it.problem.stem, answer: it.problem.answer })));
  const starsEarned = (set.score ?? 0) + (perfect ? 10 : 0) + (set.kind === "sync" ? 5 : 0);
  const stars = rate >= 90 ? 3 : rate >= 70 ? 2 : rate > 0 ? 1 : 0;

  return (
    <div className="space-y-5">
      <ResultFx perfect={perfect} />
      <div className={`card text-center py-8 border-b-8 ${perfect ? "bg-leaf-soft border-leaf border-b-leaf-dark" : "bg-brand-soft border-brand/40 border-b-brand"}`}>
        <div className="flex justify-center gap-1 text-4xl mb-2">
          {[1, 2, 3].map((n) => <span key={n} className={n <= stars ? "anim-pop" : "opacity-25 grayscale"} style={{ animationDelay: `${n * 0.15}s` }}>⭐</span>)}
        </div>
        <div className="flex items-center justify-center gap-4">
          <Mascot mood={perfect ? "cheer" : wrong.length <= 2 ? "happy" : "think"} size={110} />
          <div className="text-left">
            <p className="h-display text-5xl">{set.score} <span className="text-2xl text-muted">/ {set.total}</span></p>
            <p className="font-extrabold mt-1">{perfect ? "全对！太厉害了！" : wrong.length <= 2 ? "很不错，就差一点点！" : `错了 ${wrong.length} 题，看看讲解再试一次`}</p>
            <p className="text-xs font-bold text-muted mt-1">
              {set.durationSec ? `用时 ${Math.floor(set.durationSec / 60)} 分 ${set.durationSec % 60} 秒 · ` : ""}获得 ⭐ {starsEarned}
            </p>
          </div>
        </div>
        {set.kind === "variant" && set.mistake && (
          <p className="mt-3 text-sm font-bold">{perfect ? "这道错题消灭了！过 1 天橙橙会再来考你一次。" : "还没完全掌握，再做一组试试。"}</p>
        )}
        {set.kind === "leveltest" && <p className="mt-3 text-sm font-bold">{rate >= LEVEL_PASS ? `🎉 ${rate}% ≥ ${LEVEL_PASS}%，这一级通关了，可以去下一级！` : `${rate}%，还差一点到 ${LEVEL_PASS}%。把错的讲再看看讲一讲，过几天再测。`}</p>}
        {set.kind === "exam" && <p className="mt-3 text-sm font-bold">模拟卷做完了，每道题都可以看「解题讲解」，错题已经进错题本。</p>}
      </div>

      <ol className="space-y-2">
        {set.items.map((it) => (
          <li key={it.id} className={`card-flat border-l-8 ${it.isCorrect ? "border-l-leaf" : "border-l-berry"}`}>
            <div className="flex items-start gap-3">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-black shrink-0 ${it.isCorrect ? "bg-leaf" : "bg-berry"}`}>{it.isCorrect ? "✓" : "✗"}</span>
              <div className="flex-1 min-w-0">
                <MathText as="p" className="font-extrabold whitespace-pre-wrap" text={`${it.index + 1}. ${it.problem.stem.replace(/🔊\s*\{\{([\s\S]+?)\}\}/, "🔊 $1 ")}`}><span className="ml-2 text-[10px] text-bee-dark align-middle">{"★".repeat(Math.max(1, Math.min(5, it.problem.difficulty)))}</span></MathText>
                <p className="text-sm font-bold text-muted">
                  你答：<b className={it.isCorrect ? "text-leaf-dark" : "text-berry"}>{it.childAnswer || "（没写）"}</b>
                  {!it.isCorrect && <> · 正确：<b className="text-leaf-dark">{it.problem.answer}</b></>}
                </p>
                {!it.isCorrect && it.problem.solution && <p className="text-xs font-bold text-muted mt-1">{it.problem.solution}</p>}
                {!it.isCorrect && (
                  <div className="mt-2 flex flex-wrap gap-2 items-start">
                    <ExplainButton problemId={it.problemId} existingId={explained.get(it.problemId)} className="btn-secondary text-xs py-1.5" />
                    <WalkthroughBox problemId={it.problemId} initial={it.problem.walkthrough} />
                  </div>
                )}
                {it.isCorrect && (set.kind === "exam" || set.kind === "leveltest") && <div className="mt-2"><WalkthroughBox problemId={it.problemId} initial={it.problem.walkthrough} className="btn-ghost text-xs py-1" /></div>}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex gap-2 flex-wrap justify-center">
        {set.kind === "oral" && <StartPracticeButton kind="oral" count={set.total} timeLimitSec={set.timeLimitSec} label="再来一组 🔁" />}
        {set.kind === "sync" && <StartPracticeButton kind="sync" subjectId={set.items[0]?.problem.subjectId ?? "math"} label="再来一组同步练 🔁" />}
        {set.kind === "variant" && !perfect && set.mistakeId && <StartPracticeButton kind="variant" mistakeId={set.mistakeId} label="再做一组变式题" />}
        {set.kind === "leveltest" && <Link href="/child/olympiad" className="btn-secondary">回奥数</Link>}
        {set.kind === "exam" && <Link href="/child/exam" className="btn-secondary">回真题演练</Link>}
        <Link href="/child/practice" className="btn-secondary">返回练习</Link>
        <Link href="/child" className="btn-secondary">回首页</Link>
      </div>
    </div>
  );
}
