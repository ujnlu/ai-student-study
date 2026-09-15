import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { Mascot } from "@/components/mascot";
import { AskForm } from "@/components/ask-form";

function fmtDate(d: Date) {
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  return same ? `今天 ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}` : `${d.getMonth() + 1}月${d.getDate()}日`;
}

export default async function AskPage() {
  const { child } = await requireChild();
  const recent = await db.conversation.findMany({
    where: { childId: child.id, mistakeId: null },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: { id: true, title: true, understood: true, updatedAt: true },
  });
  const defaultSubject = child.textbooks[0]?.subjectId ?? "math";

  return (
    <div className="space-y-5">
      <section className="card bg-brand-soft/60 border-brand/30 flex items-center gap-4">
        <Mascot mood="think" size={96} className="anim-float shrink-0" />
        <div>
          <h1 className="h-display text-2xl">🙋 问橙橙</h1>
          <p className="font-bold text-base mt-1">有不会的题？打字或拍照问我！</p>
          <p className="text-xs font-bold text-muted mt-1">我不会直接告诉你答案，但会一步一步陪你想出来～</p>
        </div>
      </section>

      <section className="card">
        <AskForm defaultSubject={defaultSubject} />
      </section>

      <section className="space-y-2">
        <h2 className="h-display text-lg">🕘 最近问过的</h2>
        {recent.length === 0 ? (
          <p className="card text-center text-muted font-bold py-6">还没有问过题，快来试试吧！</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((c) => (
              <li key={c.id}>
                <Link href={`/child/ask/${c.id}`} className="tile py-3">
                  <span className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 ${c.understood ? "bg-leaf-soft" : c.understood === false ? "bg-bee-soft" : "bg-sky-soft"}`}>
                    {c.understood ? "😀" : c.understood === false ? "🤔" : "💬"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold truncate">{c.title || "（没有标题）"}</p>
                    <p className="text-xs font-bold text-muted">{fmtDate(c.updatedAt)}{c.understood ? " · 已经懂了" : c.understood === false ? " · 还没懂" : ""}</p>
                  </div>
                  <span className="text-muted">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
