import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { markUnderstoodAction } from "@/app/actions/study";
import { TutorChat } from "@/components/tutor-chat";
import { ExplainButton } from "@/components/explain-button";
import { existingExplanations } from "@/lib/explanations";

export default async function MistakeTutorPage({ params }: { params: Promise<{ id: string }> }) {
  const { child } = await requireChild();
  const { id } = await params;
  const m = await db.mistakeEntry.findFirst({
    where: { id, childId: child.id },
    include: { problem: { include: { attempts: { orderBy: { createdAt: "desc" }, take: 1 } } }, conversations: { orderBy: { createdAt: "desc" }, take: 1, include: { messages: { orderBy: { createdAt: "asc" } } } } },
  });
  if (!m) notFound();
  const explained = await existingExplanations(child.familyId, [{ id: m.problemId, stem: m.problem.stem, answer: m.problem.answer }]);

  // 复用最近一次未标记"懂了"的对话，否则新建
  let conv = m.conversations[0] && m.conversations[0].understood !== true ? m.conversations[0] : null;
  if (!conv) {
    const created = await db.conversation.create({ data: { childId: child.id, mistakeId: m.id, title: m.problem.stem.slice(0, 40) } });
    conv = { ...created, messages: [] };
  }

  return (
    <div className="space-y-3">
      <div className="card py-3">
        <p className="text-xs text-gray-500 mb-1">这道题</p>
        <p className="font-medium whitespace-pre-wrap">{m.problem.stem}</p>
        <div className="flex items-center gap-3 mt-1">
          <p className="text-sm text-gray-600">我写的：<b className="text-red-600">{m.problem.attempts[0]?.childAnswer || "（没写）"}</b></p>
          <ExplainButton problemId={m.problemId} existingId={explained.get(m.problemId)} className="btn-secondary text-xs py-1" label="🎬 看动画讲解" />
        </div>
      </div>

      <TutorChat conversationId={conv.id} childName={child.name} initial={conv.messages.map((x) => ({ role: x.role as "user" | "assistant", content: x.content }))} />

      <div className="flex gap-2 justify-center">
        <form action={markUnderstoodAction}>
          <input type="hidden" name="conversationId" value={conv.id} />
          <input type="hidden" name="understood" value="true" />
          <button className="btn-primary">😀 我懂了</button>
        </form>
        <form action={markUnderstoodAction}>
          <input type="hidden" name="conversationId" value={conv.id} />
          <input type="hidden" name="understood" value="false" />
          <button className="btn-secondary">🤔 还是不懂</button>
        </form>
      </div>
    </div>
  );
}
