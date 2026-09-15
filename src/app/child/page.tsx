import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { todayTasks } from "@/lib/practice";
import { activeDays, streakFrom, totalStars, levelOf } from "@/lib/rewards";
import { chapterPath, currentChapter } from "@/lib/sync";
import { StartPracticeButton } from "@/components/start-practice-button";

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

  const todo: { done: boolean; icon: string; label: string; hint: string; node: React.ReactNode }[] = [
    {
      done: tasks.syncDoneToday,
      icon: "📚",
      label: "今日同步练（数学）",
      hint: mathPath ? `当前：${mathPath.split(" › ").pop()} · 8 题` : "先设置学到哪一课",
      node: tasks.syncDoneToday ? null : mathChapter ? (
        <StartPracticeButton kind="sync" subjectId="math" label="开始" className="btn-primary text-sm" />
      ) : (
        <Link href="/child/progress" className="btn-secondary text-sm">设置进度</Link>
      ),
    },
    { done: tasks.oralDoneToday, icon: "🧮", label: "口算一组", hint: "10 题，3 分钟", node: tasks.oralDoneToday ? null : <StartPracticeButton kind="oral" count={10} timeLimitSec={180} label="开始" className="btn-primary text-sm" /> },
    { done: tasks.newMistakes === 0, icon: "🎬", label: `新错题 ${tasks.newMistakes} 道要讲解`, hint: "看动画或和老师聊聊", node: tasks.newMistakes > 0 ? <Link href="/child/mistakes" className="btn-primary text-sm">去看</Link> : null },
    { done: tasks.explained.length === 0, icon: "🎯", label: `${tasks.explained.length} 道错题等着消灭`, hint: "讲过了就做 3 道变式题", node: tasks.explained.length > 0 ? <Link href="/child/mistakes" className="btn-primary text-sm">去做</Link> : null },
    { done: tasks.due.length === 0, icon: "🔁", label: `复习 ${tasks.due.length} 道`, hint: "按 1/3/7/15/30 天回来看看", node: tasks.due.length > 0 ? <Link href="/child/practice" className="btn-primary text-sm">去复习</Link> : null },
    ...(tasks.readySets.filter((s) => s.kind === "ai").length > 0
      ? [{ done: false, icon: "👨‍👩‍👧", label: `爸爸妈妈布置的练习 ${tasks.readySets.filter((s) => s.kind === "ai").length} 组`, hint: "", node: <Link href="/child/practice" className="btn-primary text-sm">去做</Link> }]
      : []),
  ];
  const doneCount = todo.filter((t) => t.done).length;
  const pct = Math.round((doneCount / todo.length) * 100);

  return (
    <div className="space-y-5">
      <div className="card bg-gradient-to-br from-orange-100 via-amber-50 to-white border-orange-100">
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 shrink-0">
            <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#fed7aa" strokeWidth="3.5" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f97316" strokeWidth="3.5" strokeDasharray={`${pct} 100`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-3xl">{child.avatar}</div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-bold">你好，{child.name}！</p>
            <p className="text-gray-600 text-sm mt-0.5">
              今日任务 <b className="text-orange-600">{doneCount}/{todo.length}</b> · 连续 <b className="text-orange-600">{streak}</b> 天 🔥 · {level.emoji} {level.name}
            </p>
            {mathPath && (
              <p className="text-xs text-gray-500 mt-1 truncate">
                数学学到：{mathPath}{chinesePath ? ` · 语文：${chinesePath.split(" › ").pop()}` : ""}
                <Link href="/child/progress" className="ml-2 underline">调整</Link>
              </p>
            )}
          </div>
        </div>
      </div>

      <section className="card">
        <h2 className="font-semibold mb-2">📋 今天要做的</h2>
        <ul className="divide-y">
          {todo.map((t, i) => (
            <li key={i} className="py-2.5 flex items-center gap-3">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${t.done ? "bg-green-100" : "bg-orange-50"}`}>{t.done ? "✅" : t.icon}</span>
              <div className="flex-1 min-w-0">
                <p className={t.done ? "line-through text-gray-400" : "font-medium"}>{t.label}</p>
                {t.hint && !t.done && <p className="text-xs text-gray-500 truncate">{t.hint}</p>}
              </div>
              {!t.done && t.node}
            </li>
          ))}
        </ul>
        {doneCount === todo.length && <p className="text-center text-green-700 mt-3">今天的任务全部完成，太棒了！🎉</p>}
      </section>

      <div className="grid grid-cols-3 gap-3">
        <Link href="/child/upload" className="card text-center py-5 hover:shadow-md active:scale-95 transition">
          <div className="text-4xl">📷</div>
          <div className="mt-1 font-semibold text-sm">拍作业</div>
        </Link>
        <Link href="/child/practice" className="card text-center py-5 hover:shadow-md active:scale-95 transition">
          <div className="text-4xl">🧮</div>
          <div className="mt-1 font-semibold text-sm">练习</div>
        </Link>
        <Link href="/child/mistakes" className="card text-center py-5 hover:shadow-md active:scale-95 transition">
          <div className="text-4xl">🎯</div>
          <div className="mt-1 font-semibold text-sm">错题本</div>
        </Link>
      </div>

      {recent.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2 text-gray-700">最近的作业</h2>
          <ul className="space-y-2">
            {recent.map((u) => {
              const wrong = u.problems.filter((p) => p.attempts[0]?.isCorrect === false).length;
              return (
                <li key={u.id}>
                  <Link href={`/child/uploads/${u.id}`} className="card flex items-center gap-3 py-3 hover:shadow-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/${u.filePath}`} alt="" className="w-12 h-12 rounded-lg object-cover border" />
                    <div className="flex-1">
                      <p className="text-sm">{u.subject?.name ?? "作业"} · {u.createdAt.toLocaleDateString("zh-CN")}</p>
                      <p className="text-xs text-gray-500">{u.status === "graded" ? `${u.problems.length} 题，${wrong === 0 ? "全对 🎉" : `错 ${wrong} 题`}` : u.status === "failed" ? "批改失败" : "批改中"}</p>
                    </div>
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
