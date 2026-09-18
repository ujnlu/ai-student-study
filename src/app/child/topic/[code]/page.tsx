import Link from "next/link";
import { GRADE_NAMES as GRADE_TEXT } from "@/lib/grade";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { findTopic, getLecture, lecturesOfLevel, recommendTier, topicsFor, topicStats, warmTopicInBackground, TIERS, SUBJECT_NAME, type Tier } from "@/lib/topics";
import { TopicLectureBox } from "@/components/topic-lecture";
import { StartPracticeButton } from "@/components/start-practice-button";
import { Mascot } from "@/components/mascot";
import { THEME, type ThemeKey } from "@/components/subject-ui";
export const dynamic = "force-dynamic";


export default async function TopicPage({ params }: { params: Promise<{ code: string }> }) {
  const { child } = await requireChild();
  const { code } = await params;
  const topic = findTopic(code);
  if (!topic) notFound();
  const themeKey: ThemeKey = topic.track === "olympiad" ? "olympiad" : topic.track === "quality" ? "quality" : topic.track === "gaokao" || topic.track === "zhongkao" ? topic.track : topic.subjectId in THEME ? (topic.subjectId as ThemeKey) : "math";
  const T = THEME[themeKey];
  const [lecture, pending, recent, bank, stats] = await Promise.all([
    getLecture(code),
    db.practiceSet.findFirst({ where: { childId: child.id, topic: code, status: "ready" }, orderBy: { createdAt: "desc" } }),
    db.practiceSet.findMany({ where: { childId: child.id, topic: code, status: "done" }, orderBy: { completedAt: "desc" }, take: 6 }),
    db.problem.count({ where: { topic: code, source: "bank" } }),
    topicStats(child.id, [code]),
  ]);
  const stat = stats.get(code);
  const rec = recommendTier(stat);
  const siblings = topic.track === "olympiad" ? lecturesOfLevel(topic.level!) : topicsFor(topic.track, topic.subjectId, topic.grade);
  const idx = siblings.findIndex((t) => t.code === code);
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  // 响应发出后顺带预热：这讲的题库（讲义已有时）和下一讲的讲义 + 题库，孩子点过去就不用等
  after(() => {
    if (lecture) warmTopicInBackground(code, { familyId: child.familyId });
    if (next) warmTopicInBackground(next.code, { familyId: child.familyId });
  });
  const backHref = topic.track === "olympiad" ? `/child/olympiad?level=${topic.level}` : topic.track === "quality" ? "/child?s=quality" : topic.track === "gaokao" || topic.track === "zhongkao" ? `/child/prep?stage=${topic.track}&subject=${topic.subjectId}` : topic.grade >= 7 ? `/child/special?subject=${topic.subjectId}&g=${topic.grade}` : `/child?s=${topic.subjectId}`;
  const accent = themeKey === "chinese" ? "grape" : themeKey === "english" ? "sky" : themeKey === "quality" ? "leaf" : "brand";
  const isEssay = topic.practice === "essay";
  const crumb = topic.track === "olympiad" ? `奥数 第 ${topic.level} 级 · 第 ${topic.no} 讲` : topic.track === "gaokao" || topic.track === "zhongkao" ? `${topic.track === "gaokao" ? "高考" : "中考"}真题专讲 · ${SUBJECT_NAME[topic.subjectId]}` : `${topic.track === "quality" ? "素养" : `${SUBJECT_NAME[topic.subjectId]}专项`} · ${topic.moduleName}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm font-bold text-muted flex-wrap">
        <Link href={backHref} className="hover:underline">‹ {crumb}</Link>
        <span>·</span>
        <span>{GRADE_TEXT[topic.grade]}{topic.semester ? (topic.semester === 1 ? "上" : "下") : ""}</span>
      </div>

      <section className={`card ${T.border} bg-gradient-to-br ${T.soft} to-white`}>
        <div className="flex items-center gap-4">
          <span className="text-6xl">{topic.emoji}</span>
          <div className="flex-1 min-w-0">
            <h1 className="h-display text-2xl">{topic.name}</h1>
            <p className="font-bold text-muted">{topic.desc}</p>
            <div className="flex gap-2 flex-wrap mt-2 text-xs">
              {stat ? <span className={`badge ${stat.best >= 90 ? "bg-leaf text-white" : `${T.soft} ${T.text}`}`}>最好 {stat.best}%</span> : <span className="badge bg-gray-100 text-muted">还没练过</span>}
              {stat && <span className="badge bg-gray-100 text-muted">做过 {stat.sets} 组</span>}
              {bank > 0 && <span className="badge bg-gray-100 text-muted">题库 {bank} 题</span>}
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="flex items-center gap-2 mb-3"><span className="text-3xl">📖</span><h2 className="font-black text-lg">讲一讲</h2><span className="text-xs font-bold text-muted">故事 → 导引 → 一例一练 → 点拨</span></div>
        <TopicLectureBox code={code} initial={lecture} accent={accent} essay={isEssay} />
      </section>

      {isEssay ? (
        <section className={`card ${T.border}`}>
          <div className="flex items-center gap-3">
            <Mascot mood="happy" size={72} />
            <div className="flex-1">
              <h2 className="font-black text-lg">写一写</h2>
              <p className="text-sm font-bold text-muted">{topic.grade >= 7 ? "按讲义里的题目动笔写，写完拍照交给 AI 批改。" : "按讲义里的小题目动笔写，写完拍给橙橙，橙橙按六个维度点评。"}</p>
            </div>
            <Link href="/child/essay" className={`${T.btn} text-lg`}>📷 拍作文</Link>
          </div>
        </section>
      ) : (
        <section className={`card ${T.border} space-y-3`}>
          <div className="flex items-center gap-3">
            <Mascot mood="happy" size={64} />
            <div className="flex-1">
              <h2 className="font-black text-lg">练一练</h2>
              <p className="text-sm font-bold text-muted">三档难度，从 ★ 到 ★★★；橙橙按你最近的成绩推荐一档。</p>
            </div>
          </div>
          {pending && (
            <Link href={`/child/practice/${pending.id}`} className="tile py-3 border-bee bg-bee-soft/60">
              <span className="text-2xl">📌</span>
              <span className="flex-1 font-extrabold">还有一组没做完：{pending.title.split(" · ").pop()}</span>
              <span className={`${T.btn} text-sm py-2`}>继续 ➡️</span>
            </Link>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(TIERS) as Tier[]).map((k) => {
              const cfg = TIERS[k];
              const best = stat?.tiers[k];
              return (
                <div key={k} className={`rounded-2xl border-2 p-3 flex flex-col gap-1 ${best !== undefined && best >= 90 ? "border-leaf/40 bg-leaf-soft/40" : "border-line bg-white"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-black">{cfg.stars} {cfg.name}{k === rec && <span className="badge bg-brand text-white ml-1">推荐</span>}</span>
                    {best !== undefined && <span className={`badge ${best >= 90 ? "bg-leaf text-white" : "bg-bee-soft text-bee-dark"}`}>{best}%</span>}
                  </div>
                  <p className="text-xs font-bold text-muted flex-1">{cfg.blurb} · {cfg.size} 题</p>
                  {pending ? (
                    <span className="btn-secondary text-sm py-2 opacity-60">先做完上一组</span>
                  ) : (
                    <StartPracticeButton kind="topic" topic={code} tier={k} label={best === undefined ? "开始 🚀" : "再来一组"} className={`${k === rec ? T.btn : "btn-secondary"} text-sm py-2`} />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h2 className="font-black text-lg mb-2">🏁 最近成绩</h2>
          <ul className="space-y-2">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={`/child/practice/${s.id}`} className="tile py-3">
                  <span className="flex-1 font-extrabold truncate">{s.title.split("：").pop()}</span>
                  <span className={`font-black ${s.score === s.total ? "text-leaf" : ""}`}>{s.score}/{s.total}</span>
                  <span className="text-xs font-bold text-muted">{s.completedAt?.toLocaleDateString("zh-CN")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {next && (
        <Link href={`/child/topic/${next.code}`} className="tile py-3 border-line">
          <span className="text-2xl">{next.emoji}</span>
          <div className="flex-1"><p className="text-xs font-bold text-muted">{topic.track === "olympiad" ? `下一讲 · 第 ${next.no} 讲` : "下一个专题"}</p><p className="font-extrabold">{next.name}</p></div>
          <span className="text-muted">›</span>
        </Link>
      )}
    </div>
  );
}
