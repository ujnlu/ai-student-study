import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { chapterPath, currentChapter } from "@/lib/sync";
import { EXAM_SECONDS, EXAM_SIZE } from "@/lib/exam";
import { Mascot, MascotSays } from "@/components/mascot";
import { StartFlowButton } from "@/components/start-flow-button";
import { THEME } from "@/components/subject-ui";

const SUBJECTS = ["math", "chinese", "english"] as const;

export default async function ExamPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const { child } = await requireChild();
  const { subject: s } = await searchParams;
  const subject = (SUBJECTS as readonly string[]).includes(s ?? "") ? (s as (typeof SUBJECTS)[number]) : "math";
  const has = child.textbooks.map((t) => t.subjectId);
  const T = THEME[subject];
  const [cur, pending, recent] = await Promise.all([
    has.includes(subject) ? currentChapter(child.id, subject) : null,
    db.practiceSet.findFirst({ where: { childId: child.id, kind: "exam", status: "ready" }, orderBy: { createdAt: "desc" } }),
    db.practiceSet.findMany({ where: { childId: child.id, kind: "exam", status: "done" }, orderBy: { completedAt: "desc" }, take: 6 }),
  ]);
  const path = cur ? await chapterPath(cur.id) : null;
  const minutes = Math.round(EXAM_SECONDS / 60);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="h-display text-2xl">📄 真题演练</h1>
        <Link href={`/child?s=${subject}`} className="btn-ghost text-sm">‹ 回首页</Link>
      </div>
      <div className="flex gap-2">
        {SUBJECTS.filter((k) => has.includes(k)).map((k) => (
          <Link key={k} href={`/child/exam?subject=${k}`} className={k === subject ? `chip-on ${THEME[k].ring} ${THEME[k].soft} ${THEME[k].text}` : "chip"}>{THEME[k].emoji} {THEME[k].name}</Link>
        ))}
      </div>
      <MascotSays mood="think" size={72}>
        <p className="font-extrabold">像考试一样做一套：{EXAM_SIZE} 题、{minutes} 分钟，题目从学过的每一课里抽。做完每道题都能看「解题讲解」，错题自动进错题本。</p>
        <p className="text-xs text-muted mt-1">{path ? `现在学到：${path}` : "先在「学到哪一课」里设置进度"}</p>
      </MascotSays>

      {pending && (
        <Link href={`/child/practice/${pending.id}`} className="tile py-3 border-bee bg-bee-soft/60">
          <span className="text-2xl">📌</span>
          <span className="flex-1 font-extrabold">还有一套没做完：{pending.title}</span>
          <span className={`${T.btn} text-sm py-2`}>继续 ➡️</span>
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { scope: "mid", name: "期中模拟卷", desc: "学过的前一半单元", icon: "📝" },
          { scope: "final", name: "期末模拟卷", desc: "从第一课到现在学到的", icon: "🏁" },
        ].map((x) => (
          <section key={x.scope} className={`card ${T.border} bg-gradient-to-br ${T.soft} to-white`}>
            <div className="flex items-center gap-3">
              <span className="text-4xl">{x.icon}</span>
              <div className="flex-1">
                <h2 className="h-display text-xl">{x.name}</h2>
                <p className="text-sm font-bold text-muted">{x.desc} · {EXAM_SIZE} 题 · {minutes} 分钟</p>
              </div>
            </div>
            <div className="mt-3">
              {cur && !pending ? (
                <StartFlowButton url="/api/exam" body={{ subjectId: subject, scope: x.scope }} redirect="/child/practice/{id}" label="开始 🚀" busyLabel="正在组卷，第一次约 40 秒…" className={`${T.btn} w-full`} />
              ) : (
                <span className="btn-secondary w-full opacity-60">{pending ? "先做完上一套" : "先设置进度"}</span>
              )}
            </div>
          </section>
        ))}
      </div>

      {recent.length > 0 && (
        <section>
          <h2 className="font-black text-lg mb-2">🏁 做过的卷子</h2>
          <ul className="space-y-2">
            {recent.map((x) => (
              <li key={x.id}>
                <Link href={`/child/practice/${x.id}`} className="tile py-3">
                  <Mascot mood={x.score === x.total ? "cheer" : "happy"} size={40} />
                  <span className="flex-1 font-extrabold truncate">{x.title}</span>
                  <span className={`font-black ${x.score === x.total ? "text-leaf" : ""}`}>{x.score}/{x.total}</span>
                  <span className="text-xs font-bold text-muted">{x.completedAt?.toLocaleDateString("zh-CN")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
