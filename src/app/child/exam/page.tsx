import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { chapterPath, currentChapter } from "@/lib/sync";
import { EXAM_SECONDS, EXAM_SIZE } from "@/lib/exam";
import { Mascot, MascotSays } from "@/components/mascot";
import { StartFlowButton } from "@/components/start-flow-button";
import { THEME, type ThemeKey } from "@/components/subject-ui";
import { stageOf } from "@/lib/grade";
import { STAGE_EXAMS, STAGE_EXAM_NAME, STAGE_SUBJECTS, SECONDARY_SUBJECT_NAME, type ExamStage, type SecondarySubject } from "@/lib/secondary-catalog";
import { PAPER_STAGES } from "@/lib/papers";
import { SUBJECT_NAME, type TopicSubject } from "@/lib/topics";

const SUBJECTS = ["math", "chinese", "english"] as const;

export default async function ExamPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const { child } = await requireChild();
  const { subject: s } = await searchParams;
  const stage = stageOf(child.grade);
  if (stage !== "primary") return <StageExamPage childId={child.id} familyId={child.familyId} grade={child.grade} subject={s} />;
  const subject = (SUBJECTS as readonly string[]).includes(s ?? "") ? (s as (typeof SUBJECTS)[number]) : "math";
  const has = child.textbooks.map((t) => t.subjectId);
  const T = THEME[subject];
  const [cur, pending, recent, papers] = await Promise.all([
    has.includes(subject) ? currentChapter(child.id, subject) : null,
    db.practiceSet.findFirst({ where: { childId: child.id, kind: "exam", status: "ready" }, orderBy: { createdAt: "desc" } }),
    db.practiceSet.findMany({ where: { childId: child.id, kind: "exam", status: "done" }, orderBy: { completedAt: "desc" }, take: 6 }),
    db.paper.findMany({ where: { familyId: child.familyId, status: "ready" }, orderBy: { createdAt: "desc" } }),
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

      {papers.length > 0 && (
        <section>
          <h2 className="font-black text-lg mb-2">📚 真题卷（家长导入）</h2>
          <ul className="space-y-2">
            {papers.map((p) => (
              <li key={p.id} className="tile py-3">
                <span className="text-2xl">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="font-extrabold truncate">{p.title}</p>
                  <p className="text-xs font-bold text-muted">{PAPER_STAGES[p.stage] ?? p.stage} · {SUBJECT_NAME[p.subject as TopicSubject] ?? p.subject}{p.year ? ` · ${p.year}` : ""} · {p.total} 题 · {p.minutes} 分钟</p>
                </div>
                {pending ? <span className="btn-secondary text-sm py-2 opacity-60">先做完上一套</span> : <StartFlowButton url="/api/exam" body={{ paperId: p.id }} redirect="/child/practice/{id}" label="开始 🚀" busyLabel="准备中…" className={`${T.btn} text-sm py-2`} />}
              </li>
            ))}
          </ul>
        </section>
      )}

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

/** 初高中：中考 / 高考模拟卷 */
async function StageExamPage({ childId, familyId, grade, subject: sb }: { childId: string; familyId: string; grade: number; subject?: string }) {
  const examStage: ExamStage = stageOf(grade) === "senior" ? "gaokao" : "zhongkao";
  const subjects = STAGE_SUBJECTS[examStage === "gaokao" ? "senior" : "junior"].filter((k) => STAGE_EXAMS[examStage][k]);
  const subject: SecondarySubject = (subjects as string[]).includes(sb ?? "") ? (sb as SecondarySubject) : "math";
  const cfg = STAGE_EXAMS[examStage][subject]!;
  const n = cfg.parts.reduce((a, [, c]) => a + c, 0);
  const T = THEME[subject as ThemeKey];
  const [pending, recent, papers] = await Promise.all([
    db.practiceSet.findFirst({ where: { childId, kind: "exam", status: "ready" }, orderBy: { createdAt: "desc" } }),
    db.practiceSet.findMany({ where: { childId, kind: "exam", status: "done" }, orderBy: { completedAt: "desc" }, take: 8 }),
    db.paper.findMany({ where: { familyId, status: "ready" }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="h-display text-2xl">📄 {STAGE_EXAM_NAME[examStage]}模拟训练</h1>
        <Link href={`/child?s=${examStage}`} className="btn-ghost text-sm">‹ 回首页</Link>
      </div>
      <div className="flex gap-2 flex-wrap">
        {subjects.map((k) => (
          <Link key={k} href={`/child/exam?subject=${k}`} className={k === subject ? `chip-on ${THEME[k as ThemeKey].ring} ${THEME[k as ThemeKey].soft} ${THEME[k as ThemeKey].text}` : "chip"}>{THEME[k as ThemeKey].emoji} {SECONDARY_SUBJECT_NAME[k]}</Link>
        ))}
      </div>
      <MascotSays mood="think" size={72}>
        <p className="font-extrabold">按{STAGE_EXAM_NAME[examStage]}试卷结构组卷、限时作答；做完每题可看解题讲解，错题自动进错题本并按 1/3/7/15/30 天复习。</p>
        <p className="text-xs text-muted mt-1">题目为真题风格原创（AI 出题），不是真实试卷；主观题以客观化形式出现</p>
      </MascotSays>
      {pending && (
        <Link href={`/child/practice/${pending.id}`} className="tile py-3 border-bee bg-bee-soft/60">
          <span className="text-2xl">📌</span>
          <span className="flex-1 font-extrabold">还有一套没做完：{pending.title}</span>
          <span className={`${T.btn} text-sm py-2`}>继续 ➡️</span>
        </Link>
      )}
      <section className={`card ${T.border} bg-gradient-to-br ${T.soft} to-white`}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-4xl">{T.emoji}</span>
          <div className="flex-1 min-w-0">
            <h2 className="h-display text-xl">{STAGE_EXAM_NAME[examStage]}{SECONDARY_SUBJECT_NAME[subject]}模拟卷</h2>
            <p className="text-sm font-bold text-muted">{cfg.parts.map(([p, c]) => `${p.replace(/（.*?）/g, "")} ${c}`).join(" · ")} · 共 {n} 题 · {cfg.minutes} 分钟</p>
          </div>
          {!pending && <StartFlowButton url="/api/exam" body={{ stage: examStage, subjectId: subject }} redirect="/child/practice/{id}" label="开始 🚀" busyLabel="组卷中，第一次约 1-2 分钟…" className={`${T.btn}`} />}
        </div>
        <p className="text-xs font-bold text-muted mt-2">想先分题型练？去 <Link href={`/child/prep?stage=${examStage}&subject=${subject}`} className="underline">{STAGE_EXAM_NAME[examStage]}真题专讲</Link></p>
      </section>
      {papers.length > 0 && (
        <section>
          <h2 className="font-black text-lg mb-2">📚 历年真题卷（家长导入）</h2>
          <ul className="space-y-2">
            {papers.map((p) => (
              <li key={p.id} className="tile py-3">
                <span className="text-2xl">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="font-extrabold truncate">{p.title}</p>
                  <p className="text-xs font-bold text-muted">{PAPER_STAGES[p.stage] ?? p.stage} · {SUBJECT_NAME[p.subject as TopicSubject] ?? p.subject}{p.year ? ` · ${p.year}` : ""} · {p.total} 题 · {p.minutes} 分钟</p>
                </div>
                {pending ? <span className="btn-secondary text-sm py-2 opacity-60">先做完上一套</span> : <StartFlowButton url="/api/exam" body={{ paperId: p.id }} redirect="/child/practice/{id}" label="开始 🚀" busyLabel="准备中…" className={`${T.btn} text-sm py-2`} />}
              </li>
            ))}
          </ul>
        </section>
      )}
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
