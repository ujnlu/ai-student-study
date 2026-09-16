import Link from "next/link";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { getOrCreateAdultLearner } from "@/lib/adult";
import { WalkthroughBox } from "@/components/walkthrough-box";
import { StartPracticeButton } from "@/components/start-practice-button";
import { findTopic, SUBJECT_NAME } from "@/lib/topics";

const STATUS: Record<string, string> = { new: "新错题", explained: "已看讲解", practicing: "练习中", cleared: "已消灭" };

export default async function ParentMistakesPage() {
  const s = await requireParent();
  const learner = await getOrCreateAdultLearner(s.familyId);
  const list = await db.mistakeEntry.findMany({ where: { childId: learner.id }, include: { problem: true }, orderBy: { createdAt: "desc" }, take: 60 });
  const due = list.filter((m) => m.status === "cleared" && m.nextReviewAt && m.nextReviewAt <= new Date());
  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-gray-500"><Link href="/parent/study" className="hover:underline">‹ 家长自学</Link></p>
      <h1 className="text-2xl font-bold">📕 我的错题本</h1>
      <p className="text-sm text-gray-600">错题按 1 / 3 / 7 / 15 / 30 天间隔复习；做一组变式题全对即消灭。到期复习 {due.length} 道。</p>
      {list.length === 0 ? (
        <div className="card text-gray-500">还没有错题。</div>
      ) : (
        <ul className="space-y-2">
          {list.map((m) => {
            const t = m.problem.topic ? findTopic(m.problem.topic) : null;
            const exam = m.problem.topic?.startsWith("exam-") ? SUBJECT_NAME[m.problem.topic.replace("exam-", "") as keyof typeof SUBJECT_NAME] : null;
            return (
              <li key={m.id} className="card-flat space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className={`badge ${m.status === "cleared" ? "bg-leaf-soft text-leaf-dark" : "bg-bee-soft text-bee-dark"}`}>{STATUS[m.status] ?? m.status}</span>
                  <span className="text-gray-500">{t ? `${SUBJECT_NAME[t.subjectId]} · ${t.name}` : exam ? `${exam} · 真题演练` : "练习"}</span>
                  <span className="text-gray-400 ml-auto">{m.createdAt.toLocaleDateString("zh-CN")}</span>
                </div>
                <p className="font-semibold whitespace-pre-wrap">{m.problem.stem.replace(/🔊\s*\{\{([\s\S]+?)\}\}/, "🔊 $1 ")}</p>
                <p className="text-sm text-gray-600">正确答案：<b className="text-leaf-dark">{m.problem.answer}</b>{m.problem.solution ? ` · ${m.problem.solution}` : ""}</p>
                <div className="flex flex-wrap gap-2 items-start">
                  <WalkthroughBox problemId={m.problemId} childId={learner.id} initial={m.problem.walkthrough} />
                  {m.status !== "cleared" && <StartPracticeButton kind="variant" mistakeId={m.id} childId={learner.id} redirect="/parent/study/practice/{id}" label="做 3 道变式题消灭它" className="btn-primary text-xs py-1.5" />}
                  {m.status === "cleared" && m.nextReviewAt && m.nextReviewAt <= new Date() && <StartPracticeButton kind="review" mistakeId={m.id} childId={learner.id} redirect="/parent/study/practice/{id}" label="到期复习 2 题" className="btn-leaf text-xs py-1.5" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
