import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { getOrCreateAdultLearner } from "@/lib/adult";
import { PracticePlayer } from "@/components/practice-player";
import { WalkthroughBox } from "@/components/walkthrough-box";
import { StartPracticeButton } from "@/components/start-practice-button";
import { findTopic } from "@/lib/topics";

export default async function ParentPracticePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireParent();
  const { id } = await params;
  const learner = await getOrCreateAdultLearner(s.familyId);
  const set = await db.practiceSet.findFirst({ where: { id, childId: learner.id }, include: { items: { include: { problem: true }, orderBy: { index: "asc" } } } });
  if (!set) notFound();
  const topic = set.topic ? findTopic(set.topic) : null;
  const stageExam = /^exam-(gaokao|zhongkao)-([a-z]+)$/.exec(set.topic ?? "");
  const backHref = topic ? `/parent/study/topic/${topic.code}` : stageExam ? `/parent/study?exam=${stageExam[1]}&subject=${stageExam[2]}` : `/parent/study?exam=${(set.topic ?? "exam-gongkao").replace("exam-", "")}`;

  if (set.status !== "done") {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-gray-500 mb-3"><Link href={backHref} className="hover:underline">‹ 返回</Link></p>
        <PracticePlayer setId={set.id} title={set.title} timeLimitSec={set.timeLimitSec} subjectId="adult" childId={learner.id} resultHref={`/parent/study/practice/${set.id}`} items={set.items.map((it) => ({ index: it.index, stem: it.problem.stem, kind: it.problem.kind, answer: it.problem.kind === "subjective" ? it.problem.answer : null }))} />
      </div>
    );
  }

  const wrong = set.items.filter((it) => !it.isCorrect);
  const rate = set.total ? Math.round(((set.score ?? 0) / set.total) * 100) : 0;
  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-gray-500"><Link href={backHref} className="hover:underline">‹ 返回</Link></p>
      <div className="card flex items-center gap-4">
        <div className="text-4xl font-black">{rate}<span className="text-lg text-gray-400">%</span></div>
        <div className="flex-1">
          <p className="font-bold text-lg">{set.title}</p>
          <p className="text-sm text-gray-600">{set.score}/{set.total}{set.durationSec ? ` · 用时 ${Math.floor(set.durationSec / 60)} 分 ${set.durationSec % 60} 秒` : ""} · 错 {wrong.length} 题已进错题本</p>
        </div>
        {topic && <StartPracticeButton kind="topic" topic={topic.code} childId={learner.id} redirect="/parent/study/practice/{id}" label="再来一组" className="btn-secondary text-sm" />}
      </div>
      <ol className="space-y-2">
        {set.items.map((it) => (
          <li key={it.id} className={`card-flat border-l-4 ${it.isCorrect ? "border-l-leaf" : "border-l-berry"}`}>
            <p className="font-semibold whitespace-pre-wrap">{it.index + 1}. {it.problem.stem.replace(/🔊\s*\{\{([\s\S]+?)\}\}/, "🔊 $1 ")}<span className="ml-2 text-[10px] text-bee-dark">{"★".repeat(Math.max(1, Math.min(5, it.problem.difficulty)))}</span></p>
            <p className="text-sm text-gray-600 mt-1">
              你答：<b className={it.isCorrect ? "text-leaf-dark" : "text-berry"}>{it.childAnswer || "（未作答）"}</b>
              {!it.isCorrect && <> · 正确：<b className="text-leaf-dark">{it.problem.answer}</b></>}
            </p>
            {it.problem.solution && <p className="text-xs text-gray-500 mt-1">{it.problem.solution}</p>}
            <div className="mt-2"><WalkthroughBox problemId={it.problemId} childId={learner.id} initial={it.problem.walkthrough} className={it.isCorrect ? "btn-ghost text-xs py-1" : "btn-secondary text-xs py-1.5"} /></div>
          </li>
        ))}
      </ol>
    </div>
  );
}
