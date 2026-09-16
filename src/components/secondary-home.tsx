import Link from "next/link";
import { groupByModule, topicsFor, topicStats } from "@/lib/topics";
import { STAGE_EXAMS, STAGE_EXAM_NAME, STAGE_SUBJECTS, SECONDARY_SUBJECT_NAME, type ExamStage, type SecondarySubject } from "@/lib/secondary-catalog";
import { gradeName, stageOf } from "@/lib/grade";
import { MascotSays } from "@/components/mascot";
import { EntryTile, SectionTitle, THEME, TopicTile, type ThemeKey } from "@/components/subject-ui";
import { StartFlowButton } from "@/components/start-flow-button";

/** 初中 / 高中学生的首页学科面板：各科专项（按模块）+ 中考 / 高考真题专讲 + 模拟训练 */
export async function SecondaryHome({ childId, grade, tab }: { childId: string; grade: number; tab: string }) {
  const stage = stageOf(grade) === "senior" ? "senior" : "junior";
  const examStage: ExamStage = stage === "senior" ? "gaokao" : "zhongkao";
  const subjects = STAGE_SUBJECTS[stage];
  const tabs: string[] = [...subjects, examStage];
  const cur = tabs.includes(tab) ? tab : "math";
  const isExamTab = cur === examStage;
  const T = THEME[cur as ThemeKey];

  const specialTopics = isExamTab ? [] : topicsFor("special", cur as SecondarySubject, grade);
  const examTopics = topicsFor(examStage, isExamTab ? "math" : (cur as SecondarySubject), examStage === "gaokao" ? 12 : 9);
  const allExamTopics = isExamTab ? subjects.flatMap((s) => topicsFor(examStage, s, examStage === "gaokao" ? 12 : 9)) : [];
  const stats = await topicStats(childId, [...specialTopics, ...examTopics, ...allExamTopics].map((t) => t.code));
  const examName = STAGE_EXAM_NAME[examStage];

  return (
    <section>
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.map((k) => {
          const th = THEME[k as ThemeKey];
          const on = k === cur;
          return (
            <Link key={k} href={`/child?s=${k}`} scroll={false} className={`shrink-0 rounded-2xl border-2 px-3 py-2 text-center font-black min-w-[64px] ${on ? `${th.ring} ${th.soft} ${th.text} shadow-[0_4px_0_0_var(--line)]` : "border-line bg-white text-muted"}`}>
              <div className="text-xl leading-none">{th.emoji}</div>
              <div className="text-xs mt-1">{k === examStage ? examName : th.name}</div>
            </Link>
          );
        })}
      </div>

      <div className={`mt-3 rounded-3xl border-2 ${T.border} bg-white p-4 space-y-5`}>
        {isExamTab ? (
          <>
            <MascotSays mood="think" size={72}>
              <p className="font-extrabold">{examName}真题专讲：按试卷题型逐个拆——考情 → 套路 → 真题风格例题 → 失分点，再做三档训练，最后整卷模拟。</p>
              <p className="text-xs text-muted mt-1">题目为真题风格原创，不是真实试卷；做完每题都有解题讲解</p>
            </MascotSays>
            <div>
              <SectionTitle right={<Link href={`/child/exam`} className="text-xs font-bold text-muted">全部模拟卷 ›</Link>}>📄 {examName}模拟训练</SectionTitle>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {subjects.filter((s) => STAGE_EXAMS[examStage][s]).map((s) => {
                  const cfg = STAGE_EXAMS[examStage][s]!;
                  const n = cfg.parts.reduce((a, [, c]) => a + c, 0);
                  return (
                    <div key={s} className={`tile flex-col items-start gap-0.5 border-2 py-3 ${THEME[s as ThemeKey].border} bg-white`}>
                      <span className="text-2xl">{THEME[s as ThemeKey].emoji}</span>
                      <span className="font-black">{SECONDARY_SUBJECT_NAME[s]}</span>
                      <span className="text-xs font-bold text-muted">{n} 题 · {cfg.minutes} 分钟</span>
                      <div className="mt-1"><StartFlowButton url="/api/exam" body={{ stage: examStage, subjectId: s }} redirect="/child/practice/{id}" label="开始" busyLabel="组卷中，约 1-2 分钟…" className={`${THEME[s as ThemeKey].btn} text-xs py-1.5 px-3`} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
            {subjects.map((s) => {
              const list = allExamTopics.filter((t) => t.subjectId === s);
              if (!list.length) return null;
              return (
                <div key={s}>
                  <SectionTitle right={<Link href={`/child/prep?stage=${examStage}&subject=${s}`} className="text-xs font-bold text-muted">全部 ›</Link>}>{THEME[s as ThemeKey].emoji} {SECONDARY_SUBJECT_NAME[s]}真题专讲</SectionTitle>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{list.slice(0, 3).map((t) => <TopicTile key={t.code} topic={t} stat={stats.get(t.code)} theme={examStage} />)}</div>
                </div>
              );
            })}
          </>
        ) : (
          <>
            <div>
              <SectionTitle right={<Link href={`/child/special?subject=${cur}&g=${grade}`} className="text-xs font-bold text-muted">全部 ›</Link>}>📚 {gradeName(grade)}{SECONDARY_SUBJECT_NAME[cur as SecondarySubject]} · 专项提升</SectionTitle>
              {specialTopics.length === 0 ? (
                <p className="text-sm font-bold text-muted card-flat">这个年级的{SECONDARY_SUBJECT_NAME[cur as SecondarySubject]}还没有专题。</p>
              ) : (
                groupByModule(specialTopics).map((gp) => (
                  <div key={gp.module} className="mb-2">
                    <p className="text-xs font-extrabold text-muted mb-1">{gp.emoji} {gp.name}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{gp.topics.map((t) => <TopicTile key={t.code} topic={t} stat={stats.get(t.code)} theme={cur as ThemeKey} />)}</div>
                  </div>
                ))
              )}
            </div>
            <div>
              <SectionTitle right={<Link href={`/child/prep?stage=${examStage}&subject=${cur}`} className="text-xs font-bold text-muted">全部 ›</Link>}>🎯 {examName}真题专讲 · {SECONDARY_SUBJECT_NAME[cur as SecondarySubject]}</SectionTitle>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {examTopics.slice(0, 3).map((t) => <TopicTile key={t.code} topic={t} stat={stats.get(t.code)} theme={examStage} />)}
                {STAGE_EXAMS[examStage][cur as SecondarySubject] && <EntryTile href={`/child/exam?subject=${cur}`} icon="📄" label={`${examName}模拟卷`} sub="整卷限时 · 逐题解题讲解" theme={examStage} />}
              </div>
            </div>
            {cur === "english" && (
              <div>
                <SectionTitle>🗣️ 口语与阅读</SectionTitle>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <EntryTile href="/child/speaking" icon="🎤" label="口语跟读 · 对话" sub="听一句读一句" theme="english" />
                  <EntryTile href="/child/reading?lang=en" icon="📚" label="英文分级阅读" sub="L1-L6" theme="english" />
                </div>
              </div>
            )}
            {cur === "chinese" && (
              <div>
                <SectionTitle>📚 阅读与写作</SectionTitle>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <EntryTile href="/child/reading?lang=zh" icon="📚" label="分级阅读" sub="L1-L6" theme="chinese" />
                  <EntryTile href="/child/essay" icon="📝" label="作文批改" sub="拍作文，AI 点评" theme="chinese" />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
