import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { topicsFor, topicStats } from "@/lib/topics";
import { STAGE_EXAMS, STAGE_EXAM_NAME, STAGE_SUBJECTS, SECONDARY_SUBJECT_NAME, type ExamStage, type SecondarySubject } from "@/lib/secondary-catalog";
import { stageOf } from "@/lib/grade";
import { MascotSays } from "@/components/mascot";
import { THEME, TopicTile, type ThemeKey } from "@/components/subject-ui";
import { StartFlowButton } from "@/components/start-flow-button";

/** 中考 / 高考真题专讲：按科目列出真题题型专讲 + 模拟卷入口 */
export default async function PrepPage({ searchParams }: { searchParams: Promise<{ stage?: string; subject?: string }> }) {
  const { child } = await requireChild();
  const { stage: st, subject: sb } = await searchParams;
  const stage: ExamStage = st === "gaokao" || st === "zhongkao" ? st : stageOf(child.grade) === "senior" ? "gaokao" : "zhongkao";
  const subjects = STAGE_SUBJECTS[stage === "gaokao" ? "senior" : "junior"];
  const subject: SecondarySubject = (subjects as string[]).includes(sb ?? "") ? (sb as SecondarySubject) : "math";
  const topics = topicsFor(stage, subject, stage === "gaokao" ? 12 : 9);
  const [stats, lectured, pending, recent] = await Promise.all([
    topicStats(child.id, topics.map((t) => t.code)),
    db.topicLecture.findMany({ where: { code: { in: topics.map((t) => t.code) } }, select: { code: true } }),
    db.practiceSet.findFirst({ where: { childId: child.id, kind: "exam", status: "ready" }, orderBy: { createdAt: "desc" } }),
    db.practiceSet.findMany({ where: { childId: child.id, kind: "exam", status: "done", topic: `exam-${stage}-${subject}` }, orderBy: { completedAt: "desc" }, take: 5 }),
  ]);
  const lecturedSet = new Set(lectured.map((l) => l.code));
  const T = THEME[stage];
  const ST = THEME[subject as ThemeKey];
  const cfg = STAGE_EXAMS[stage][subject];
  const n = cfg ? cfg.parts.reduce((a, [, c]) => a + c, 0) : 0;
  const mastered = topics.filter((t) => (stats.get(t.code)?.best ?? 0) >= 90).length;
  const examName = STAGE_EXAM_NAME[stage];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="h-display text-2xl">{T.emoji} {examName}真题专讲</h1>
        <div className="flex gap-1">
          <Link href={`/child/prep?stage=${stage === "gaokao" ? "zhongkao" : "gaokao"}&subject=${subject}`} className="btn-ghost text-sm">看{stage === "gaokao" ? "中考" : "高考"}</Link>
          <Link href={`/child?s=${stage}`} className="btn-ghost text-sm">‹ 回首页</Link>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {subjects.map((k) => (
          <Link key={k} href={`/child/prep?stage=${stage}&subject=${k}`} className={k === subject ? `chip-on ${THEME[k as ThemeKey].ring} ${THEME[k as ThemeKey].soft} ${THEME[k as ThemeKey].text}` : "chip"}>{THEME[k as ThemeKey].emoji} {SECONDARY_SUBJECT_NAME[k]}</Link>
        ))}
      </div>
      <MascotSays mood="think" size={72}>
        <p className="font-extrabold">{SECONDARY_SUBJECT_NAME[subject]}{examName}按题型拆成 {topics.length} 个专讲：考情 → 套路 → 真题风格例题 → 失分点，每讲三档训练；练熟了整卷模拟。</p>
        <p className="text-xs text-muted mt-1">已掌握 {mastered}/{topics.length} · 题目为真题风格原创，不是真实试卷</p>
      </MascotSays>

      {cfg && (
        <section className={`card ${ST.border} bg-gradient-to-br ${ST.soft} to-white`}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-4xl">📄</span>
            <div className="flex-1 min-w-0">
              <h2 className="h-display text-xl">{examName}{SECONDARY_SUBJECT_NAME[subject]}模拟卷</h2>
              <p className="text-sm font-bold text-muted">{cfg.parts.map(([p, c]) => `${p.replace(/（.*?）/g, "")} ${c}`).join(" · ")} · 共 {n} 题 · {cfg.minutes} 分钟</p>
            </div>
            {pending ? (
              <Link href={`/child/practice/${pending.id}`} className={`${ST.btn} text-sm`}>继续上一套 ➡️</Link>
            ) : (
              <StartFlowButton url="/api/exam" body={{ stage, subjectId: subject }} redirect="/child/practice/{id}" label="开始模拟 🚀" busyLabel="组卷中，第一次约 1-2 分钟…" className={`${ST.btn} text-sm`} />
            )}
          </div>
          {recent.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {recent.map((x) => (
                <li key={x.id}>
                  <Link href={`/child/practice/${x.id}`} className="card-flat py-2 flex items-center gap-3 text-sm">
                    <span className="flex-1 font-extrabold truncate">{x.title}</span>
                    <span className={`font-black ${x.score === x.total ? "text-leaf" : ""}`}>{x.score}/{x.total}</span>
                    <span className="text-xs font-bold text-muted">{x.completedAt?.toLocaleDateString("zh-CN")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {topics.map((t) => <TopicTile key={t.code} topic={t} stat={stats.get(t.code)} theme={stage} lectured={lecturedSet.has(t.code)} />)}
      </div>
    </div>
  );
}
