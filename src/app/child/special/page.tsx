import Link from "next/link";
import { GRADE_NAMES as GRADE_TEXT } from "@/lib/grade";
import { requireChild } from "@/lib/auth";
import { groupByModule, topicsFor, topicStats, type TopicSubject } from "@/lib/topics";
import { MascotSays } from "@/components/mascot";
import { GradeChips, THEME, TopicTile, type ThemeKey } from "@/components/subject-ui";
import { db } from "@/lib/db";
import { STAGE_GRADES, stageOf } from "@/lib/grade";
import { STAGE_SUBJECTS, SECONDARY_SUBJECT_NAME } from "@/lib/secondary-catalog";

const TABS: { key: TopicSubject; theme: ThemeKey; label: string; emoji: string }[] = [
  { key: "math", theme: "math", label: "数学", emoji: "🧮" },
  { key: "chinese", theme: "chinese", label: "语文", emoji: "📖" },
  { key: "english", theme: "english", label: "英语", emoji: "🔤" },
  { key: "science", theme: "quality", label: "科学", emoji: "🔬" },
  { key: "coding", theme: "quality", label: "编程思维", emoji: "💻" },
  { key: "culture", theme: "quality", label: "国学人文", emoji: "🏯" },
];
const BLURB: Partial<Record<TopicSubject, string>> = {
  math: "按模块专练：计算、数与概念、图形、量与计量、应用题。",
  chinese: "大语文四板块：基础知识、阅读理解、写作、文学与国学。",
  english: "听说读写八模块：语音拼读、词汇、语法、听力、阅读、写作、世界百科（口语在「英语口语」里）。",
  science: "跟着课标学科学：植物动物、天气、光声力、地球宇宙……",
  coding: "不插电的编程思维：指令、循环、条件、流程图、算法。",
  culture: "国学人文：节日节气、成语典故、诗词、历史。",
};

export default async function SpecialPage({ searchParams }: { searchParams: Promise<{ subject?: string; g?: string }> }) {
  const { child } = await requireChild();
  const { subject: s, g } = await searchParams;
  const grade = Math.min(12, Math.max(1, Number(g) || child.grade));
  const stage = stageOf(grade);
  const tabs: { key: TopicSubject; theme: ThemeKey; label: string; emoji: string }[] =
    stage === "primary" ? TABS : STAGE_SUBJECTS[stage].map((k) => ({ key: k, theme: k as ThemeKey, label: SECONDARY_SUBJECT_NAME[k], emoji: THEME[k as ThemeKey].emoji }));
  const tab = tabs.find((t) => t.key === s) ?? tabs[0];
  const track = tab.theme === "quality" ? "quality" : "special";
  const topics = topicsFor(track, tab.key, grade);
  const [stats, lectured] = await Promise.all([topicStats(child.id, topics.map((t) => t.code)), db.topicLecture.findMany({ where: { code: { in: topics.map((t) => t.code) } }, select: { code: true } })]);
  const lecturedSet = new Set(lectured.map((l) => l.code));
  const T = THEME[tab.theme];
  const groups = groupByModule(topics);
  const mastered = topics.filter((t) => (stats.get(t.code)?.best ?? 0) >= 90).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="h-display text-2xl">🎯 专项加练</h1>
        <Link href={`/child?s=${tab.theme === "quality" ? "quality" : tab.key}`} className="btn-ghost text-sm">‹ 回首页</Link>
      </div>
      <div className="flex gap-2 flex-wrap">
        {tabs.map((k) => (
          <Link key={k.key} href={`/child/special?subject=${k.key}&g=${grade}`} className={k.key === tab.key ? `chip-on ${THEME[k.theme].ring} ${THEME[k.theme].soft} ${THEME[k.theme].text}` : "chip"}>{k.emoji} {k.label}</Link>
        ))}
      </div>
      <MascotSays mood="happy" size={72}>
        <p className="font-extrabold">{BLURB[tab.key] ?? `${GRADE_TEXT[grade]}${tab.label}：按模块专练，每个专题先讲一讲，再做三档练习。`}</p>
        <p className="text-xs text-muted mt-1">{GRADE_TEXT[grade]} · {topics.length} 个专题 · 已掌握 {mastered} · 每个专题先讲一讲，再做 ★ ★★ ★★★ 三档练习</p>
      </MascotSays>
      <GradeChips current={grade} grades={STAGE_GRADES[stage]} hrefFor={(x) => `/child/special?subject=${tab.key}&g=${x}`} />
      <div className="flex gap-2 text-xs font-bold">
        {(["primary", "junior", "senior"] as const).map((st) => <Link key={st} href={`/child/special?subject=math&g=${STAGE_GRADES[st][0]}`} className={st === stage ? "chip-on" : "chip"}>{st === "primary" ? "小学" : st === "junior" ? "初中" : "高中"}</Link>)}
      </div>
      {tab.key === "math" && stage === "primary" && (
        <Link href="/child/practice" className={`tile py-3 border-2 ${T.border} ${T.soft}`}>
          <span className="text-3xl">⏱️</span>
          <div className="flex-1"><p className="font-black">口算天天练</p><p className="text-xs font-bold text-muted">10 / 20 / 30 题，限时挑战，还能和橙橙 PK</p></div>
          <span className="text-muted">›</span>
        </Link>
      )}
      {tab.key === "english" && (
        <Link href="/child/speaking" className={`tile py-3 border-2 ${T.border} ${T.soft}`}>
          <span className="text-3xl">🗣️</span>
          <div className="flex-1"><p className="font-black">口语：跟读打分 · 和橙橙聊英语</p><p className="text-xs font-bold text-muted">听一句读一句，或者自由对话</p></div>
          <span className="text-muted">›</span>
        </Link>
      )}
      {groups.map((gp) => (
        <section key={gp.module}>
          <h2 className={`font-black text-base mb-2 ${T.text}`}>{gp.emoji} {gp.name}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {gp.topics.map((t) => <TopicTile key={t.code} topic={t} stat={stats.get(t.code)} theme={tab.theme} lectured={lecturedSet.has(t.code)} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
