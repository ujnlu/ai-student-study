import Link from "next/link";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { getOrCreateAdultLearner } from "@/lib/adult";
import { ADULT_EXAMS, groupByModule, topicsFor, topicStats, type AdultSubject } from "@/lib/topics";
import { adultExamCode } from "@/lib/exam";
import { StartFlowButton } from "@/components/start-flow-button";

const SUBJECTS = Object.keys(ADULT_EXAMS) as AdultSubject[];

export default async function ParentStudyPage({ searchParams }: { searchParams: Promise<{ exam?: string }> }) {
  const s = await requireParent();
  const { exam: e } = await searchParams;
  const subject: AdultSubject = (SUBJECTS as string[]).includes(e ?? "") ? (e as AdultSubject) : "gongkao";
  const exam = ADULT_EXAMS[subject];
  const learner = await getOrCreateAdultLearner(s.familyId);
  const topics = topicsFor("adult", subject, 0);
  const [stats, lectured, pendingExam, recent, mistakes] = await Promise.all([
    topicStats(learner.id, topics.map((t) => t.code)),
    db.topicLecture.findMany({ where: { code: { in: topics.map((t) => t.code) } }, select: { code: true } }),
    db.practiceSet.findFirst({ where: { childId: learner.id, kind: "exam", topic: adultExamCode(subject), status: "ready" }, orderBy: { createdAt: "desc" } }),
    db.practiceSet.findMany({ where: { childId: learner.id, status: "done", OR: [{ topic: { startsWith: `adult-${subject}-` } }, { topic: adultExamCode(subject) }] }, orderBy: { completedAt: "desc" }, take: 8 }),
    db.mistakeEntry.count({ where: { childId: learner.id, status: { not: "cleared" }, problem: { OR: [{ topic: { startsWith: `adult-${subject}-` } }, { topic: adultExamCode(subject) }] } } }),
  ]);
  const lecturedSet = new Set(lectured.map((l) => l.code));
  const groups = groupByModule(topics);
  const exams = recent.filter((r) => r.kind === "exam");
  const mastered = topics.filter((t) => (stats.get(t.code)?.best ?? 0) >= 90).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">🎓 家长自学</h1>
          <p className="text-sm text-gray-500">和孩子端同一套引擎：讲一讲 → 三档练一练 → 真题演练 → 逐题解题讲解，错题自动进错题本并按 1/3/7/15/30 天复习。</p>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {SUBJECTS.map((k) => (
          <Link key={k} href={`/parent/study?exam=${k}`} className={`px-4 py-2 rounded-full text-sm font-bold border ${k === subject ? "bg-brand text-white border-brand" : "bg-white border-line hover:bg-gray-50"}`}>{ADULT_EXAMS[k].emoji} {ADULT_EXAMS[k].name}</Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{exam.emoji}</span>
            <div className="flex-1">
              <h2 className="text-xl font-bold">{exam.name} · 真题演练</h2>
              <p className="text-sm text-gray-600">{exam.blurb} · 整卷 {exam.examSize} 题 · {exam.examMinutes} 分钟 · 仿真真题风格（AI 出题，非真实试卷）</p>
            </div>
            {pendingExam ? (
              <Link href={`/parent/study/practice/${pendingExam.id}`} className="btn-primary">继续做卷 ➡️</Link>
            ) : (
              <StartFlowButton url="/api/exam" body={{ adult: subject }} redirect="/parent/study/practice/{id}" label="开始一套 🚀" busyLabel="正在出卷，第一次约 60 秒…" className="btn-primary" />
            )}
          </div>
          {exams.length > 0 && (
            <ul className="mt-4 divide-y divide-line">
              {exams.map((x) => (
                <li key={x.id} className="py-2 flex items-center gap-3 text-sm">
                  <Link href={`/parent/study/practice/${x.id}`} className="flex-1 font-semibold hover:underline">{x.title}</Link>
                  <span className={`font-bold ${x.score === x.total ? "text-leaf-dark" : ""}`}>{x.score}/{x.total}</span>
                  <span className="text-gray-400">{x.completedAt?.toLocaleDateString("zh-CN")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card space-y-2 text-sm">
          <h2 className="font-bold">学情</h2>
          <p className="text-gray-600">专题 {topics.length} 个 · 已讲 {lecturedSet.size} · 掌握 {mastered}</p>
          <p className="text-gray-600">待消灭错题 {mistakes} 道</p>
          <p className="text-gray-600">已做 {recent.length} 组</p>
          <Link href="/parent/study/mistakes" className="btn-secondary text-sm mt-2">错题本 ›</Link>
        </section>
      </div>

      {groups.map((gp) => (
        <section key={gp.module}>
          <h2 className="font-bold text-lg mb-2">{gp.emoji} {gp.name}</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {gp.topics.map((t) => {
              const st = stats.get(t.code);
              const tiers = st?.tiers ?? {};
              return (
                <Link key={t.code} href={`/parent/study/topic/${t.code}`} className={`card-flat hover:shadow-md flex flex-col gap-1 ${st && st.best >= 90 ? "border-leaf/50 bg-leaf-soft/30" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-bold flex-1 truncate">{t.name}</span>
                    {st ? <span className={`badge ${st.best >= 90 ? "bg-leaf text-white" : "bg-bee-soft text-bee-dark"}`}>{st.best}%</span> : lecturedSet.has(t.code) ? <span className="badge bg-gray-100 text-gray-500">已讲</span> : null}
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-1">{t.desc}</p>
                  {t.practice === "essay" ? (
                    <span className="text-[10px] font-bold text-grape">✍️ 主观题 · 讲法 + 范文</span>
                  ) : (
                    <span className="flex gap-1 text-[10px] font-bold">
                      {(["basic", "advanced", "challenge"] as const).map((k, i) => {
                        const v = tiers[k];
                        return <span key={k} className={`px-1.5 rounded-full ${v === undefined ? "bg-gray-100 text-gray-400" : v >= 90 ? "bg-leaf text-white" : "bg-bee-soft text-bee-dark"}`}>{"★".repeat(i + 1)}</span>;
                      })}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
