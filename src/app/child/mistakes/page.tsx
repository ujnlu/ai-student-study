import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { clearMistakeAction } from "@/app/actions/study";
import { ExplainButton } from "@/components/explain-button";
import { MathText } from "@/components/math-text";
import { StartPracticeButton } from "@/components/start-practice-button";
import { existingExplanations } from "@/lib/explanations";
import { MascotSays } from "@/components/mascot";

const STATUS: Record<string, { label: string; cls: string; step: number }> = {
  new: { label: "① 先看讲解", cls: "bg-berry-soft text-berry", step: 1 },
  explained: { label: "② 做变式题", cls: "bg-bee-soft text-bee-dark", step: 2 },
  practicing: { label: "② 再练一组", cls: "bg-sky-soft text-sky-dark", step: 2 },
  cleared: { label: "✓ 已消灭 · 待复习", cls: "bg-leaf-soft text-leaf-dark", step: 3 },
};

export default async function MistakesPage({ searchParams }: { searchParams: Promise<{ all?: string; subject?: string }> }) {
  const { child } = await requireChild();
  const { all, subject } = await searchParams;
  const list = await db.mistakeEntry.findMany({
    where: { childId: child.id, ...(all ? {} : { status: { not: "cleared" } }), ...(subject ? { problem: { subjectId: subject } } : {}) },
    include: { problem: { include: { knowledgePoint: true, subject: true, attempts: { orderBy: { createdAt: "desc" }, take: 1 } } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  const counts = { new: list.filter((m) => m.status === "new").length, todo: list.filter((m) => m.status === "explained" || m.status === "practicing").length };
  const explained = await existingExplanations(child.familyId, list.map((m) => ({ id: m.problemId, stem: m.problem.stem, answer: m.problem.answer })));
  const q = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { all, subject, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/child/mistakes${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h-display text-2xl">🎯 错题本</h1>
        <div className="flex gap-2 no-print">
          <Link href="/child/mistakes/print" className="btn-ghost text-sm">🖨️ 打印</Link>
          <Link href={q({ all: all ? undefined : "1" })} className="btn-ghost text-sm">{all ? "只看没消灭的" : "看全部"}</Link>
        </div>
      </div>

      {list.length === 0 ? (
        <MascotSays mood="cheer">太棒了，没有错题！去练习里再挑战一下吧。</MascotSays>
      ) : (
        <MascotSays mood="happy">
          {counts.new > 0 ? `有 ${counts.new} 道题还没看讲解，先看讲解再做变式题，做对就能消灭它！` : counts.todo > 0 ? `${counts.todo} 道题讲过了，做 3 道变式题全对就消灭！` : "错题都消灭了，等着复习就行。"}
        </MascotSays>
      )}

      <div className="flex gap-2 flex-wrap">
        {[["", "全部"], ["math", "数学"], ["chinese", "语文"], ["english", "英语"]].map(([id, name]) => (
          <Link key={id} href={q({ subject: id || undefined })} className={(subject ?? "") === id ? "chip-on" : "chip"}>{name}</Link>
        ))}
      </div>

      <ul className="space-y-3">
        {list.map((m) => {
          const st = STATUS[m.status] ?? { label: m.status, cls: "bg-gray-100", step: 0 };
          return (
            <li key={m.id} className="card">
              <div className="flex items-center gap-2 text-xs mb-2 flex-wrap">
                <span className={`badge ${st.cls}`}>{st.label}</span>
                {m.problem.subject && <span className="badge bg-gray-100 text-muted">{m.problem.subject.name}</span>}
                {m.problem.knowledgePoint && <span className="badge bg-sky-soft text-sky-dark normal-case tracking-normal">{m.problem.knowledgePoint.name}</span>}
                <span className="text-muted font-bold ml-auto">{m.createdAt.toLocaleDateString("zh-CN")}</span>
              </div>
              <MathText as="p" className="font-extrabold text-lg whitespace-pre-wrap" text={m.problem.stem} />
              <p className="text-sm font-bold text-muted mt-1">我写的：<b className="text-berry">{m.problem.attempts[0]?.childAnswer || "（没写）"}</b></p>
              <div className="mt-3 flex gap-2 flex-wrap">
                {m.status !== "cleared" && <ExplainButton problemId={m.problemId} existingId={explained.get(m.problemId)} className={m.status === "new" ? "btn-primary text-sm py-2" : "btn-secondary text-sm py-2"} />}
                {(m.status === "explained" || m.status === "practicing") && <StartPracticeButton kind="variant" mistakeId={m.id} label="🎯 做 3 道变式题" className="btn-leaf text-sm py-2" />}
                {m.status !== "cleared" && <Link href={`/child/mistakes/${m.id}`} className="btn-secondary text-sm py-2">💬 和橙橙聊聊</Link>}
                {m.status !== "cleared" && m.status !== "new" && (
                  <form action={clearMistakeAction}><input type="hidden" name="id" value={m.id} /><button className="btn-ghost text-sm">我会了，直接消灭</button></form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
