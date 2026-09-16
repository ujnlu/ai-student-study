import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { todayTasks } from "@/lib/practice";
import { activeDays, streakFrom, totalStars, levelOf } from "@/lib/rewards";
import { chapterPath, currentChapter, currentTextbook } from "@/lib/sync";
import { groupByModule, lecturesOfLevel, olympiadLevel, topicsFor, topicStats, MODULES } from "@/lib/topics";
import { speakTopicsFor } from "@/lib/speaking";
import { weeklyPlan } from "@/lib/plan";
import { StartPracticeButton } from "@/components/start-practice-button";
import { MascotSays } from "@/components/mascot";
import { EntryTile, SectionTitle, THEME, TopicTile, type ThemeKey } from "@/components/subject-ui";

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? "早上好" : h < 14 ? "中午好" : h < 18 ? "下午好" : "晚上好";
}

const TABS: ThemeKey[] = ["math", "chinese", "english", "olympiad", "quality"];

export default async function ChildHome({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { child } = await requireChild();
  const { s } = await searchParams;
  const tab: ThemeKey = (TABS as string[]).includes(s ?? "") ? (s as ThemeKey) : "math";
  const subjects = child.textbooks.map((t) => t.subjectId);
  const [tasks, days, stars, recent, mathChapter, chineseChapter, englishTb] = await Promise.all([
    todayTasks(child.id),
    activeDays(child.id, 60),
    totalStars(child.id),
    db.upload.findMany({ where: { childId: child.id }, orderBy: { createdAt: "desc" }, take: 3, include: { subject: true, problems: { include: { attempts: { take: 1, orderBy: { createdAt: "desc" } } } } } }),
    subjects.includes("math") ? currentChapter(child.id, "math") : null,
    subjects.includes("chinese") ? currentChapter(child.id, "chinese") : null,
    subjects.includes("english") ? currentTextbook(child.id, "english") : null,
  ]);
  const streak = streakFrom(days);
  const level = levelOf(stars);
  const mathPath = mathChapter ? await chapterPath(mathChapter.id) : null;
  const chinesePath = chineseChapter ? await chapterPath(chineseChapter.id) : null;

  // ---------- 今天的任务 ----------
  type Task = { done: boolean; icon: string; color: string; label: string; doneLabel?: string; hint: string; node: React.ReactNode };
  const todo: Task[] = [
    {
      done: tasks.syncDoneToday,
      icon: "📚",
      color: "bg-sky-soft",
      label: "今日同步练",
      hint: mathPath ? `数学 · ${mathPath.split(" › ").pop()} · 8 题` : "先告诉我学到哪一课",
      node: tasks.syncDoneToday ? null : mathChapter ? <StartPracticeButton kind="sync" subjectId="math" label="开始" className="btn-sky text-sm py-2" /> : <Link href="/child/progress" className="btn-secondary text-sm py-2">设置</Link>,
    },
    { done: tasks.oralDoneToday, icon: "🧮", color: "bg-brand-soft", label: "口算一组", hint: "10 题 · 3 分钟", node: tasks.oralDoneToday ? null : <StartPracticeButton kind="oral" count={10} timeLimitSec={180} label="开始" className="btn-primary text-sm py-2" /> },
    { done: tasks.newMistakes === 0, icon: "🎬", color: "bg-grape-soft", label: `${tasks.newMistakes} 道新错题要讲解`, doneLabel: "没有新错题", hint: "看动画或和橙橙聊聊", node: <Link href="/child/mistakes" className="btn-secondary text-sm py-2">去看</Link> },
    { done: tasks.explained.length === 0, icon: "🎯", color: "bg-leaf-soft", label: `${tasks.explained.length} 道错题等着消灭`, doneLabel: "错题都消灭了", hint: "做 3 道变式题就能消灭", node: <Link href="/child/mistakes" className="btn-secondary text-sm py-2">去做</Link> },
    { done: tasks.due.length === 0, icon: "🔁", color: "bg-bee-soft", label: `复习 ${tasks.due.length} 道`, doneLabel: "没有要复习的", hint: "按 1/3/7/15/30 天回来看看", node: <Link href="/child/practice" className="btn-secondary text-sm py-2">去复习</Link> },
    ...(tasks.readySets.filter((x) => x.kind === "ai").length > 0
      ? [{ done: false, icon: "👨‍👩‍👧", color: "bg-berry-soft", label: `爸爸妈妈布置了 ${tasks.readySets.filter((x) => x.kind === "ai").length} 组练习`, hint: "", node: <Link href="/child/practice" className="btn-secondary text-sm py-2">去做</Link> }]
      : []),
  ];
  const pending = todo.filter((t) => !t.done);
  const doneCount = todo.length - pending.length;
  const pct = Math.round((doneCount / todo.length) * 100);
  const allDone = pending.length === 0;

  // ---------- 学科面板数据 ----------
  const grade = child.grade;
  const olyLevel = olympiadLevel(child.grade, child.semester);
  const olyTopics = lecturesOfLevel(olyLevel);
  const qualityTopics = (["science", "coding", "culture"] as const).flatMap((sub) => topicsFor("quality", sub, grade));
  const specialCodes = (["math", "chinese", "english"] as const).flatMap((sub) => topicsFor("special", sub, grade).map((t) => t.code));
  const stats = await topicStats(child.id, [...specialCodes, ...olyTopics.map((t) => t.code), ...qualityTopics.map((t) => t.code)]);
  const speakTopics = speakTopicsFor(grade);
  const plan = await weeklyPlan(child);
  const planDone = plan.filter((p) => p.done >= p.target).length;
  const T = THEME[tab];
  const olyNext = olyTopics.filter((t) => !(stats.get(t.code)?.sets ?? 0)).slice(0, 3);
  const olyMastered = olyTopics.filter((t) => (stats.get(t.code)?.best ?? 0) >= 90).length;

  return (
    <div className="space-y-5">
      <MascotSays mood={allDone ? "cheer" : "happy"} size={96}>
        <p className="text-lg">
          {greeting()}，{child.name}！{allDone ? "今天的任务全部完成，你太棒了！🎉" : doneCount === 0 ? "今天从哪个开始？先来一组口算热热身吧。" : `已经完成 ${doneCount} 个任务，再加把劲！`}
        </p>
        <p className="text-xs text-muted mt-1">连续学习 {streak} 天 · {level.emoji} {level.name} · ⭐ {stars}</p>
      </MascotSays>

      {/* 今天的任务：只列还没做的，做完的折成一行 */}
      <section className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="h-display text-xl">📋 今天的任务</h2>
          <span className="font-black text-brand text-lg">{doneCount}/{todo.length}</span>
        </div>
        <div className="bar mb-3"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
        {allDone ? (
          <p className="font-extrabold text-leaf-dark py-2">🎉 全部完成！去下面的学科里再练一练吧。</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((t, i) => (
              <li key={i} className="tile py-2.5 border-line">
                <span className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0 ${t.color}`}>{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-extrabold leading-tight">{t.label}</p>
                  {t.hint && <p className="text-xs font-bold text-muted truncate">{t.hint}</p>}
                </div>
                {t.node}
              </li>
            ))}
          </ul>
        )}
        {doneCount > 0 && !allDone && (
          <p className="text-xs font-bold text-muted mt-2">已完成：{todo.filter((t) => t.done).map((t) => `✓ ${t.doneLabel ?? t.label}`).join(" · ")}</p>
        )}
        <div className="mt-3 pt-3 border-t-2 border-dashed border-line">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-extrabold text-muted">🗓️ 本周计划</p>
            <span className="text-xs font-black text-muted">{planDone}/{plan.length}</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {plan.map((p) => {
              const ok = p.done >= p.target;
              return (
                <Link key={p.key} href={p.href} title={p.hint} className={`shrink-0 rounded-xl border-2 px-2.5 py-1.5 text-xs font-extrabold flex items-center gap-1 ${ok ? "border-leaf/40 bg-leaf-soft text-leaf-dark" : "border-line bg-white text-foreground"}`}>
                  <span>{ok ? "✓" : p.icon}</span>
                  <span>{p.label}</span>
                  <span className={`px-1 rounded-full ${ok ? "bg-leaf text-white" : "bg-gray-100 text-muted"}`}>{Math.min(p.done, p.target)}/{p.target}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* 学科切换 */}
      <section>
        <div className="grid grid-cols-5 gap-1.5">
          {TABS.map((k) => {
            const th = THEME[k];
            const on = k === tab;
            return (
              <Link key={k} href={`/child?s=${k}`} scroll={false} className={`rounded-2xl border-2 py-2 text-center font-black transition-transform ${on ? `${th.ring} ${th.soft} ${th.text} scale-[1.03] shadow-[0_4px_0_0_var(--line)]` : "border-line bg-white text-muted"}`}>
                <div className="text-xl leading-none">{th.emoji}</div>
                <div className="text-xs mt-1">{th.name}</div>
              </Link>
            );
          })}
        </div>

        <div className={`mt-3 rounded-3xl border-2 ${T.border} bg-white p-4 space-y-5`}>
          {tab === "math" && (
            <>
              <div>
                <SectionTitle right={<Link href="/child/progress?subject=math" className="text-xs font-bold text-muted">{mathPath ? "换一课 ›" : "设置进度 ›"}</Link>}>🏫 跟着学校学</SectionTitle>
                {mathPath && <p className="text-xs font-bold text-muted mb-2 truncate">学到：{mathPath}</p>}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <EntryTile href="/child/lesson?subject=math" icon="📚" label="今天这一课" sub="看课 · 预习卡 · 微课" theme="math" />
                  <EntryTile href="/child/video?subject=math" icon="📺" label="视频教学" sub="每一课的老师讲课" theme="math" />
                  <div className={`tile flex-col items-start gap-0.5 border-2 py-3 ${T.border} bg-white`}>
                    <span className="text-3xl">✏️</span>
                    <span className="font-black">同步练</span>
                    <span className="text-xs font-bold text-muted">8 题 · 学完这课练</span>
                    <div className="mt-1">{mathChapter ? <StartPracticeButton kind="sync" subjectId="math" label="开始" className="btn-primary text-xs py-1.5 px-3" /> : <Link href="/child/progress?subject=math" className="btn-secondary text-xs py-1.5 px-3">先设置进度</Link>}</div>
                  </div>
                  <EntryTile href="/child/unit-test" icon="🏁" label="单元测" sub="15 题 · 20 分钟" theme="math" />
                  <EntryTile href="/child/review" icon="🔁" label="加固复习" sub="薄弱点 · 周末总复习" theme="math" />
                  <EntryTile href="/child/pk" icon="⚔️" label="口算 PK" sub="和橙橙比一比" theme="math" />
                </div>
              </div>
              <div>
                <SectionTitle right={<Link href="/child/special?subject=math" className="text-xs font-bold text-muted">全部专项 ›</Link>}>🎯 专项提升</SectionTitle>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                  <Link href="/child/practice" className={`tile flex-col items-start gap-1 border-2 py-3 ${T.border} ${T.soft}`}>
                    <div className="flex items-center gap-2 w-full"><span className="text-2xl">⏱️</span><span className="font-black flex-1">口算天天练</span></div>
                    <span className="text-xs font-bold text-muted">10 / 20 / 30 题，限时挑战</span>
                  </Link>
                </div>
                {groupByModule(topicsFor("special", "math", grade)).map((gp) => (
                  <div key={gp.module} className="mb-2">
                    <p className="text-xs font-extrabold text-muted mb-1">{gp.emoji} {gp.name}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{gp.topics.map((t) => <TopicTile key={t.code} topic={t} stat={stats.get(t.code)} theme="math" />)}</div>
                  </div>
                ))}
              </div>
              <div>
                <SectionTitle right={<Link href="/child?s=olympiad" className="text-xs font-bold text-muted">思维拓展 ›</Link>}>🧠 思维拓展 · 奥数第 {olyLevel} 级</SectionTitle>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(olyNext.length ? olyNext : olyTopics.slice(0, 3)).map((t) => <TopicTile key={t.code} topic={t} stat={stats.get(t.code)} theme="olympiad" />)}
                </div>
              </div>
            </>
          )}

          {tab === "chinese" && (
            <>
              <div>
                <SectionTitle right={<Link href="/child/progress?subject=chinese" className="text-xs font-bold text-muted">{chinesePath ? "换一课 ›" : "设置进度 ›"}</Link>}>🏫 跟着学校学</SectionTitle>
                {chinesePath && <p className="text-xs font-bold text-muted mb-2 truncate">学到：{chinesePath}</p>}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <EntryTile href="/child/lesson?subject=chinese" icon="📚" label="今天这一课" sub="看课 · 预习卡 · 微课" theme="chinese" />
                  <EntryTile href="/child/video?subject=chinese" icon="📺" label="视频教学" sub="每一课的老师讲课" theme="chinese" />
                  <EntryTile href="/child/dictation" icon="✍️" label="语文听写" sub="橙橙读，你来写" theme="chinese" />
                  <EntryTile href="/child/recite" icon="🎋" label="背古诗课文" sub="背给橙橙听" theme="chinese" />
                  <div className={`tile flex-col items-start gap-0.5 border-2 py-3 ${T.border} bg-white`}>
                    <span className="text-3xl">✏️</span>
                    <span className="font-black">同步练</span>
                    <span className="text-xs font-bold text-muted">8 题 · 学完这课练</span>
                    <div className="mt-1">{chineseChapter ? <StartPracticeButton kind="sync" subjectId="chinese" label="开始" className={`${T.btn} text-xs py-1.5 px-3`} /> : <Link href="/child/progress?subject=chinese" className="btn-secondary text-xs py-1.5 px-3">先设置进度</Link>}</div>
                  </div>
                  <EntryTile href="/child/essay" icon="📝" label="作文点评" sub="拍作文给橙橙看" theme="chinese" />
                </div>
              </div>
              <div>
                <SectionTitle right={<Link href="/child/special?subject=chinese" className="text-xs font-bold text-muted">全部 ›</Link>}>📚 大语文 · 读写提升</SectionTitle>
                {groupByModule(topicsFor("special", "chinese", grade)).map((gp) => (
                  <div key={gp.module} className="mb-2">
                    <p className="text-xs font-extrabold text-muted mb-1">{gp.emoji} {gp.name}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{gp.topics.map((t) => <TopicTile key={t.code} topic={t} stat={stats.get(t.code)} theme="chinese" />)}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "english" && (
            <>
              <div>
                <SectionTitle right={<Link href="/child/speaking" className="text-xs font-bold text-muted">全部主题 ›</Link>}>🗣️ 口语练习</SectionTitle>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <Link href="/child/speaking/chat" className="tile flex-col items-start gap-0.5 border-2 py-3 border-sky bg-gradient-to-br from-sky-soft to-white hover:-translate-y-0.5">
                    <span className="text-3xl">💬</span>
                    <span className="font-black">和橙橙聊英语</span>
                    <span className="text-xs font-bold text-muted">说什么都行，橙橙会回你</span>
                  </Link>
                  <Link href="/child/speaking" className="tile flex-col items-start gap-0.5 border-2 py-3 border-sky/30 bg-sky-soft hover:-translate-y-0.5">
                    <span className="text-3xl">🎤</span>
                    <span className="font-black">跟读打分</span>
                    <span className="text-xs font-bold text-muted">听一句读一句，橙橙打分</span>
                  </Link>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {speakTopics.slice(0, 6).map((t) => (
                    <Link key={t.code} href={`/child/speaking/${t.code}`} className="chip border-sky/30">{t.emoji} {t.name}</Link>
                  ))}
                </div>
              </div>
              <div>
                <SectionTitle>🏫 跟着学校学</SectionTitle>
                {englishTb ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <EntryTile href="/child/lesson?subject=english" icon="📚" label="今天这一课" sub="看课 · 预习卡" theme="english" />
                    <EntryTile href="/child/video?subject=english" icon="📺" label="视频教学" sub="每一课的老师讲课" theme="english" />
                    <EntryTile href="/child/speaking?tab=book" icon="📖" label="跟着课本读" sub="每个单元的句子" theme="english" />
                    <div className={`tile flex-col items-start gap-0.5 border-2 py-3 ${T.border} bg-white`}>
                      <span className="text-3xl">✏️</span>
                      <span className="font-black">同步练</span>
                      <span className="text-xs font-bold text-muted">8 题 · 学完这课练</span>
                      <div className="mt-1"><StartPracticeButton kind="sync" subjectId="english" label="开始" className="btn-sky text-xs py-1.5 px-3" /></div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm font-bold text-muted card-flat">课本上的英语从三年级开始。现在先把口语和单词练起来，上了三年级这里会自动出现课本内容。</p>
                )}
              </div>
              <div>
                <SectionTitle right={<Link href="/child/special?subject=english" className="text-xs font-bold text-muted">全部 ›</Link>}>🎯 听说读写 · 分模块练</SectionTitle>
                {groupByModule(topicsFor("special", "english", grade)).map((gp) => (
                  <div key={gp.module} className="mb-2">
                    <p className="text-xs font-extrabold text-muted mb-1">{gp.emoji} {gp.name}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{gp.topics.map((t) => <TopicTile key={t.code} topic={t} stat={stats.get(t.code)} theme="english" />)}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "olympiad" && (
            <>
              <MascotSays mood="think" size={72}>
                <p className="font-extrabold">奥数不是难题堆，是把数学「想明白」的方法。12 级体系：每学期一级、每级 20 讲，每讲先讲一讲，再做 ★ ★★ ★★★ 三档练习。</p>
                <p className="text-xs text-muted mt-1">你现在在第 {olyLevel} 级（{["", "一", "二", "三", "四", "五", "六"][grade]}年级{child.semester === 1 ? "上" : "下"}）· 已掌握 {olyMastered}/{olyTopics.length} 讲</p>
              </MascotSays>
              <div>
                <SectionTitle right={<Link href={`/child/olympiad?level=${olyLevel}`} className="text-xs font-bold text-muted">全部 20 讲 · 换级 ›</Link>}>🧠 接下来学</SectionTitle>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(olyNext.length ? olyNext : olyTopics.slice(0, 3)).map((t) => <TopicTile key={t.code} topic={t} stat={stats.get(t.code)} theme="olympiad" />)}
                </div>
              </div>
              <div>
                <SectionTitle>📚 按模块看</SectionTitle>
                <div className="flex gap-2 flex-wrap">
                  {["calc", "number", "geometry", "word", "motion", "combo", "counting", "mixed"].map((k) => {
                    const n = olyTopics.filter((t) => t.module === k).length;
                    return n ? <Link key={k} href={`/child/olympiad?level=${olyLevel}&m=${k}`} className="chip">{MODULES[k].emoji} {MODULES[k].name} <span className="text-muted">{n}</span></Link> : null;
                  })}
                </div>
              </div>
            </>
          )}

          {tab === "quality" && (
            <>
              <MascotSays mood="happy" size={72}>
                <p className="font-extrabold">素养板块：科学、编程思维、国学人文。不考试，但很有意思，每个专题都有讲一讲和小测验。</p>
                <p className="text-xs text-muted mt-1">按年级段安排，答对也有星星</p>
              </MascotSays>
              {(["science", "coding", "culture"] as const).map((sub) => {
                const list = qualityTopics.filter((t) => t.subjectId === sub);
                return (
                  <div key={sub}>
                    <SectionTitle right={<Link href={`/child/special?subject=${sub}`} className="text-xs font-bold text-muted">全部 ›</Link>}>{MODULES[sub].emoji} {MODULES[sub].name}</SectionTitle>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{list.slice(0, 6).map((t) => <TopicTile key={t.code} topic={t} stat={stats.get(t.code)} theme="quality" />)}</div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </section>

      {/* 常用工具 */}
      <section className="grid grid-cols-4 gap-2">
        {[
          { href: "/child/upload", icon: "📷", label: "拍作业" },
          { href: "/child/ask", icon: "💬", label: "问橙橙" },
          { href: "/child/mistakes", icon: "🎯", label: "错题本" },
          { href: "/child/shop", icon: "🎁", label: "星星商店" },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="tile flex-col items-center gap-1 border-line py-3 hover:-translate-y-0.5">
            <span className="text-2xl">{c.icon}</span>
            <span className="text-xs font-black">{c.label}</span>
          </Link>
        ))}
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="h-display text-xl mb-3">📷 最近的作业</h2>
          <ul className="space-y-2">
            {recent.map((u) => {
              const wrong = u.problems.filter((p) => p.attempts[0]?.isCorrect === false).length;
              return (
                <li key={u.id}>
                  <Link href={`/child/uploads/${u.id}`} className="tile py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/${u.filePath}`} alt="" className="w-14 h-14 rounded-xl object-cover border-2 border-line" />
                    <div className="flex-1">
                      <p className="font-extrabold">{u.subject?.name ?? "作业"} · {u.createdAt.toLocaleDateString("zh-CN")}</p>
                      <p className="text-xs font-bold text-muted">{u.status === "graded" ? `${u.problems.length} 题，${wrong === 0 ? "全对 🎉" : `错 ${wrong} 题`}` : u.status === "failed" ? "批改失败" : "批改中"}</p>
                    </div>
                    <span className="text-muted">›</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
