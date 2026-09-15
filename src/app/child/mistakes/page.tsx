import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { clearMistakeAction } from "@/app/actions/study";
import { ExplainButton } from "@/components/explain-button";
import { StartPracticeButton } from "@/components/start-practice-button";
import { existingExplanations } from "@/lib/explanations";

const STATUS: Record<string, [string, string]> = {
  new: ["没讲过", "bg-red-100 text-red-700"],
  explained: ["讲过了", "bg-yellow-100 text-yellow-800"],
  practicing: ["练习中", "bg-blue-100 text-blue-700"],
  cleared: ["已消灭·待复习", "bg-green-100 text-green-700"],
};

export default async function MistakesPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { child } = await requireChild();
  const { all } = await searchParams;
  const list = await db.mistakeEntry.findMany({
    where: { childId: child.id, ...(all ? {} : { status: { not: "cleared" } }) },
    include: { problem: { include: { knowledgePoint: true, subject: true, attempts: { orderBy: { createdAt: "desc" }, take: 1 } } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  const explained = await existingExplanations(child.familyId, list.map((m) => ({ id: m.problemId, stem: m.problem.stem, answer: m.problem.answer })));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">错题本</h1>
        <Link href={all ? "/child/mistakes" : "/child/mistakes?all=1"} className="text-sm text-gray-500 underline">{all ? "只看没消灭的" : "看全部"}</Link>
      </div>
      {list.length === 0 && <div className="card text-center text-gray-500 py-10">太棒了，没有错题！🎉</div>}
      <ul className="space-y-3">
        {list.map((m) => {
          const [label, cls] = STATUS[m.status] ?? [m.status, "bg-gray-100"];
          return (
            <li key={m.id} className="card">
              <div className="flex items-center gap-2 text-xs mb-1">
                <span className={`badge ${cls}`}>{label}</span>
                {m.problem.subject && <span className="badge bg-orange-50 text-orange-700">{m.problem.subject.name}</span>}
                {m.problem.knowledgePoint && <span className="badge bg-blue-50 text-blue-700">{m.problem.knowledgePoint.name}</span>}
                <span className="text-gray-400 ml-auto">{m.createdAt.toLocaleDateString("zh-CN")}</span>
              </div>
              <p className="font-medium whitespace-pre-wrap">{m.problem.stem}</p>
              <p className="text-sm text-gray-600 mt-1">我写的：<b className="text-red-600">{m.problem.attempts[0]?.childAnswer || "（没写）"}</b></p>
              <div className="mt-3 flex gap-2">
                {m.status !== "cleared" && <ExplainButton problemId={m.problemId} existingId={explained.get(m.problemId)} className={m.status === "new" ? "btn-primary text-sm" : "btn-secondary text-sm"} />}
                {m.status !== "cleared" && <Link href={`/child/mistakes/${m.id}`} className="btn-secondary text-sm">💬 {m.status === "new" ? "和老师聊聊" : "再聊一次"}</Link>}
                {(m.status === "explained" || m.status === "practicing") && (
                  <StartPracticeButton kind="variant" mistakeId={m.id} label="🎯 做 3 道变式题" className="btn-primary text-sm" />
                )}
                {m.status !== "cleared" && m.status !== "new" && (
                  <form action={clearMistakeAction}><input type="hidden" name="id" value={m.id} /><button className="btn-secondary text-sm">✅ 直接消灭</button></form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
