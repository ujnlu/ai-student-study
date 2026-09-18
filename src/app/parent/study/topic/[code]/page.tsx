import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { getOrCreateAdultLearner } from "@/lib/adult";
import { findTopic, getLecture, recommendTier, topicStats, ADULT_EXAMS, TIERS, SUBJECT_NAME, type AdultSubject, type Tier } from "@/lib/topics";
import { TopicLectureBox } from "@/components/topic-lecture";
import { StartPracticeButton } from "@/components/start-practice-button";
import { gradeName } from "@/lib/grade";
export const dynamic = "force-dynamic";

export default async function ParentTopicPage({ params }: { params: Promise<{ code: string }> }) {
  const s = await requireParent();
  const { code } = await params;
  const topic = findTopic(code);
  if (!topic) notFound();
  const learner = await getOrCreateAdultLearner(s.familyId);
  const exam = ADULT_EXAMS[topic.subjectId as AdultSubject];
  const stageTrack = topic.track === "gaokao" || topic.track === "zhongkao" ? topic.track : topic.track === "special" && topic.grade >= 7 ? (topic.grade >= 10 ? "gaokao" : "zhongkao") : null;
  const fromBrowse = topic.track !== "adult" && !(topic.track === "gaokao" || topic.track === "zhongkao");
  const crumbHref = fromBrowse ? `/parent/browse?g=${topic.grade}&subject=${["science", "coding", "culture"].includes(topic.subjectId) ? "math" : topic.subjectId}` : stageTrack ? `/parent/study?exam=${stageTrack}&subject=${topic.subjectId}` : `/parent/study?exam=${topic.subjectId}`;
  const crumbText = fromBrowse ? `内容总览 · ${gradeName(topic.grade)}${SUBJECT_NAME[topic.subjectId]}` : stageTrack ? `${stageTrack === "gaokao" ? "高考" : "中考"}真题专讲 · ${SUBJECT_NAME[topic.subjectId]}` : exam?.name ?? "家长自学";
  const [lecture, pending, recent, stats] = await Promise.all([
    getLecture(code),
    db.practiceSet.findFirst({ where: { childId: learner.id, topic: code, status: "ready" }, orderBy: { createdAt: "desc" } }),
    db.practiceSet.findMany({ where: { childId: learner.id, topic: code, status: "done" }, orderBy: { completedAt: "desc" }, take: 6 }),
    topicStats(learner.id, [code]),
  ]);
  const stat = stats.get(code);
  const rec = recommendTier(stat);
  const isEssay = topic.practice === "essay";

  return (
    <div className="space-y-5 max-w-3xl">
      <p className="text-sm text-gray-500"><Link href={crumbHref} className="hover:underline">‹ {crumbText}</Link> · {topic.moduleName}</p>
      <div>
        <h1 className="text-2xl font-bold">{topic.emoji} {topic.name}</h1>
        <p className="text-gray-600">{topic.desc}{stat ? ` · 最好 ${stat.best}% · 做过 ${stat.sets} 组` : ""}</p>
      </div>
      <section className="card">
        <h2 className="font-bold mb-2">讲一讲 <span className="text-xs text-gray-400 font-normal">{stageTrack ? "考情 → 套路 → 真题风格例题 → 失分点" : "考情 → 考点 → 套路 → 例题 → 陷阱"}</span></h2>
        <TopicLectureBox code={code} initial={lecture} accent="brand" essay={isEssay} childId={learner.id} />
      </section>
      {isEssay ? (
        <section className="card text-sm text-gray-600">主观题专题：按讲义里的题目自己动笔写，可以把写好的内容发给「问橙橙」式的 AI 对话让它点评（后续版本会加主观题批改）。</section>
      ) : (
        <section className="card space-y-3">
          <h2 className="font-bold">练一练 <span className="text-xs text-gray-400 font-normal">三档难度，按最近成绩推荐一档；错题自动进错题本</span></h2>
          {pending && <Link href={`/parent/study/practice/${pending.id}`} className="block rounded-xl bg-bee-soft px-4 py-2 font-semibold">📌 还有一组没做完：{pending.title.split(" · ").pop()} ➡️</Link>}
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(TIERS) as Tier[]).map((k) => {
              const cfg = TIERS[k];
              const best = stat?.tiers[k];
              return (
                <div key={k} className="rounded-xl border border-line p-3 flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold">{cfg.stars} {cfg.name}{k === rec && <span className="badge bg-brand text-white ml-1">推荐</span>}</span>
                    {best !== undefined && <span className={`badge ${best >= 90 ? "bg-leaf text-white" : "bg-bee-soft text-bee-dark"}`}>{best}%</span>}
                  </div>
                  <p className="text-xs text-gray-500 flex-1">{cfg.size} 题</p>
                  {pending ? <span className="btn-secondary text-sm py-2 opacity-60">先做完上一组</span> : <StartPracticeButton kind="topic" topic={code} tier={k} childId={learner.id} redirect="/parent/study/practice/{id}" label={best === undefined ? "开始" : "再来一组"} className={`${k === rec ? "btn-primary" : "btn-secondary"} text-sm py-2`} />}
                </div>
              );
            })}
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <section className="card">
          <h2 className="font-bold mb-2">最近成绩</h2>
          <ul className="divide-y divide-line text-sm">
            {recent.map((x) => (
              <li key={x.id} className="py-2 flex items-center gap-3">
                <Link href={`/parent/study/practice/${x.id}`} className="flex-1 font-semibold hover:underline">{x.title.split("：").pop()}</Link>
                <span className="font-bold">{x.score}/{x.total}</span>
                <span className="text-gray-400">{x.completedAt?.toLocaleDateString("zh-CN")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
