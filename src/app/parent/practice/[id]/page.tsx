import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { approveSetAction, deletePracticeItemAction, updatePracticeItemAction } from "@/app/actions/practice";

export default async function ParentPracticeSetPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireParent();
  const { id } = await params;
  const set = await db.practiceSet.findFirst({
    where: { id, child: { familyId: s.familyId } },
    include: { child: true, knowledgePoint: true, items: { include: { problem: true }, orderBy: { index: "asc" } } },
  });
  if (!set) notFound();
  const editable = set.status === "pending_review";

  return (
    <div className="space-y-4">
      <div className="card">
        <p className="text-sm text-gray-500">{set.child.avatar} {set.child.name} · {set.knowledgePoint?.name ?? set.kind} · {set.status}</p>
        {editable ? (
          <form action={approveSetAction} className="mt-2 flex gap-2 items-end">
            <input type="hidden" name="id" value={set.id} />
            <div className="flex-1"><label className="label">练习标题</label><input name="title" defaultValue={set.title} className="input" /></div>
            <button className="btn-primary">✅ 审核通过，发给孩子</button>
          </form>
        ) : (
          <h1 className="text-xl font-bold mt-1">{set.title}{set.status === "done" && <span className="ml-3 text-base font-normal">得分 {set.score}/{set.total}</span>}</h1>
        )}
        {editable && <p className="text-xs text-gray-500 mt-2">请核对每题的答案，AI 出题偶尔会算错；改完点各题的「保存」。</p>}
      </div>

      <ol className="space-y-3">
        {set.items.map((it) =>
          editable ? (
            <li key={it.id} className="card">
              <form action={updatePracticeItemAction} className="space-y-2">
                <input type="hidden" name="itemId" value={it.id} />
                <div><label className="label">第 {it.index + 1} 题</label><textarea name="stem" rows={2} defaultValue={it.problem.stem} className="input" /></div>
                <div className="grid sm:grid-cols-2 gap-2">
                  <div><label className="label">答案</label><input name="answer" defaultValue={it.problem.answer ?? ""} className="input" /></div>
                  <div><label className="label">解析</label><input name="solution" defaultValue={it.problem.solution ?? ""} className="input" /></div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary text-sm">保存</button>
                  <button formAction={deletePracticeItemAction} className="btn-danger text-sm">删掉这题</button>
                </div>
              </form>
            </li>
          ) : (
            <li key={it.id} className={`card py-3 ${it.isCorrect === false ? "border-l-4 border-l-red-400" : it.isCorrect ? "border-l-4 border-l-green-400" : ""}`}>
              <p className="font-medium whitespace-pre-wrap">{it.index + 1}. {it.problem.stem}</p>
              <p className="text-sm text-gray-600">答案：{it.problem.answer}{it.childAnswer !== null && <> · 孩子答：<b className={it.isCorrect ? "text-green-700" : "text-red-600"}>{it.childAnswer || "（没写）"}</b></>}</p>
              {it.problem.solution && <p className="text-xs text-gray-500">{it.problem.solution}</p>}
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
