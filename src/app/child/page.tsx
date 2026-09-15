import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { todayTasks } from "@/lib/practice";
import { activeDays, streakFrom, totalStars, levelOf } from "@/lib/rewards";
import { chapterPath, currentChapter } from "@/lib/sync";
import { StartPracticeButton } from "@/components/start-practice-button";
import { MascotSays } from "@/components/mascot";

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? "早上好" : h < 14 ? "中午好" : h < 18 ? "下午好" : "晚上好";
}

export default async function ChildHome() {
  const { child } = await requireChild();
  const subjects = child.textbooks.map((t) => t.subjectId);
  const [tasks, days, stars, recent, mathChapter, chineseChapter] = await Promise.all([
    todayTasks(child.id),
    activeDays(child.id, 60),
    totalStars(child.id),
    db.upload.findMany({ where: { childId: child.id }, orderBy: { createdAt: "desc" }, take: 3, include: { subject: true, problems: { include: { attempts: { take: 1, orderBy: { createdAt: "desc" } } } } } }),
    subjects.includes("math") ? currentChapter(child.id, "math") : null,
    subjects.includes("chinese") ? currentChapter(child.id, "chinese") : null,
  ]);
  const streak = streakFrom(days);
  const level = levelOf(stars);
  const mathPath = mathChapter ? await chapterPath(mathChapter.id) : null;
  const chinesePath = chineseChapter ? await chapterPath(chineseChapter.id) : null;

  type Task = { done: boolean; icon: string; color: string; label: string; hint: string; node: React.ReactNode };
  const todo: Task[] = [
    {
      done: tasks.syncDoneToday,
      icon: "📚",
      color: "bg-sky-soft",
      label: "今日同步练",
      hint: mathPath ? `数学 · ${mathPath.split(" › ").pop()} · 8 题 · 不会先去「今天这一课」看课` : "先告诉我学到哪一课",
      node: tasks.syncDoneToday ? null : mathChapter ? <StartPracticeButton kind="sync" subjectId="math" label="开始" className="btn-sky text-sm py-2" /> : <Link href="/child/progress" className="btn-secondary text-sm py-2">设置</Link>,
    },
    { done: tasks.oralDoneToday, icon: "🧮", color: "bg-brand-soft", label: "口算一组", hint: "10 题 · 3 分钟", node: tasks.oralDoneToday ? null : <StartPracticeButton kind="oral" count={10} timeLimitSec={180} label="开始" className="btn-primary text-sm py-2" /> },
    { done: tasks.newMistakes === 0, icon: "🎬", color: "bg-grape-soft", label: `${tasks.newMistakes} 道新错题要讲解`, hint: "看动画或和橙橙聊聊", node: tasks.newMistakes > 0 ? <Link href="/child/mistakes" className="btn-secondary text-sm py-2">去看</Link> : null },
    { done: tasks.explained.length === 0, icon: "🎯", color: "bg-leaf-soft", label: `${tasks.explained.length} 道错题等着消灭`, hint: "做 3 道变式题就能消灭", node: tasks.explained.length > 0 ? <Link href="/child/mistakes" className="btn-secondary text-sm py-2">去做</Link> : null },
    { done: tasks.due.length === 0, icon: "🔁", color: "bg-bee-soft", label: `复习 ${tasks.due.length} 道`, hint: "按 1/3/7/15/30 天回来看看", node: tasks.due.length > 0 ? <Link href="/child/practice" className="btn-secondary text-sm py-2">去复习</Link> : null },
    ...(tasks.readySets.filter((s) => s.kind === "ai").length > 0
      ? [{ done: false, icon: "👨‍👩‍👧", color: "bg-berry-soft", label: `爸爸妈妈布置了 ${tasks.readySets.filter((s) => s.kind === "ai").length} 组练习`, hint: "", node: <Link href="/child/practice" className="btn-secondary text-sm py-2">去做</Link> }]
      : []),
  ];
  const doneCount = todo.filter((t) => t.done).length;
  const pct = Math.round((doneCount / todo.length) * 100);
  const allDone = doneCount === todo.length;

  return (
    <div className="space-y-5">
      <MascotSays mood={allDone ? "cheer" : "happy"} size={104}>
        <p className="text-lg">
          {greeting()}，{child.name}！{allDone ? "今天的任务全部完成，你太棒了！🎉" : doneCount === 0 ? "今天从哪个开始？先来一组口算热热身吧。" : `已经完成 ${doneCount} 个任务，再加把劲！`}
        </p>
        <p className="text-xs text-muted mt-1">连续学习 {streak} 天 · {level.emoji} {level.name} · ⭐ {stars}</p>
      </MascotSays>

      <section className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="h-display text-xl">📋 今天的任务</h2>
          <span className="font-black text-brand text-lg">{doneCount}/{todo.length}</span>
        </div>
        <div className="bar mb-4"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
        <ul className="space-y-2">
          {todo.map((t, i) => (
            <li key={i} className={`tile py-3 ${t.done ? "border-leaf-soft bg-leaf-soft/40" : "border-line"}`}>
              <span className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${t.done ? "bg-leaf text-white" : t.color}`}>{t.done ? "✓" : t.icon}</span>
              <div className="flex-1 min-w-0">
                <p className={`font-extrabold ${t.done ? "text-muted line-through" : ""}`}>{t.label}</p>
                {t.hint && !t.done && <p className="text-xs font-bold text-muted truncate">{t.hint}</p>}
              </div>
              {!t.done && t.node}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="h-display text-xl mb-3">🎒 学习乐园</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: "/child/lesson", icon: "📚", label: "今天这一课", sub: "看课 · 预习 · 微课", color: "bg-brand-soft border-brand/30" },
            { href: "/child/ask", icon: "💬", label: "问橙橙", sub: "不会的题随时问", color: "bg-sky-soft border-sky/30" },
            { href: "/child/upload", icon: "📷", label: "拍作业", sub: "橙橙帮你检查", color: "bg-sky-soft border-sky/30" },
            { href: "/child/practice", icon: "🧮", label: "练习", sub: "同步练 · 口算", color: "bg-brand-soft border-brand/30" },
            { href: "/child/review", icon: "🔁", label: "加固复习", sub: "薄弱点 · 周末总复习", color: "bg-leaf-soft border-leaf/30" },
            { href: "/child/essay", icon: "📝", label: "作文点评", sub: "拍作文给橙橙看", color: "bg-grape-soft border-grape/30" },
            { href: "/child/pk", icon: "⚔️", label: "口算 PK", sub: "和橙橙比一比", color: "bg-berry-soft border-berry/30" },
            { href: "/child/dictation", icon: "✍️", label: "语文听写", sub: "橙橙来读你来写", color: "bg-grape-soft border-grape/30" },
            { href: "/child/recite", icon: "📖", label: "背古诗", sub: "背给橙橙听", color: "bg-leaf-soft border-leaf/30" },
            { href: "/child/unit-test", icon: "🏁", label: "单元测", sub: "15 题 · 20 分钟", color: "bg-bee-soft border-bee/40" },
            { href: "/child/mistakes", icon: "🎯", label: "错题本", sub: "消灭它们", color: "bg-berry-soft border-berry/30" },
            { href: "/child/shop", icon: "🎁", label: "星星商店", sub: "换奖励", color: "bg-bee-soft border-bee/40" },
          ].map((c) => (
            <Link key={c.href} href={c.href} className={`tile flex-col items-start gap-1 border-2 ${c.color} hover:-translate-y-0.5`}>
              <span className="text-4xl">{c.icon}</span>
              <span className="font-black text-lg">{c.label}</span>
              <span className="text-xs font-bold text-muted">{c.sub}</span>
            </Link>
          ))}
        </div>
      </section>

      {(mathPath || chinesePath) && (
        <section className="card-flat flex items-center gap-3 text-sm font-bold">
          <span className="text-2xl">🏫</span>
          <div className="flex-1 min-w-0 text-muted">
            {mathPath && <p className="truncate">数学学到：{mathPath}</p>}
            {chinesePath && <p className="truncate">语文学到：{chinesePath}</p>}
          </div>
          <Link href="/child/progress" className="btn-ghost text-sm">调整</Link>
        </section>
      )}

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
