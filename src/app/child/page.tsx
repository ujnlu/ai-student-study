import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { streakDays, todayTasks } from "@/lib/practice";
import { StartPracticeButton } from "@/components/start-practice-button";

export default async function ChildHome() {
  const { child } = await requireChild();
  const [tasks, streak, recent] = await Promise.all([
    todayTasks(child.id),
    streakDays(child.id),
    db.upload.findMany({ where: { childId: child.id }, orderBy: { createdAt: "desc" }, take: 3, include: { subject: true, problems: { include: { attempts: { take: 1, orderBy: { createdAt: "desc" } } } } } }),
  ]);
  const todo = [
    { done: tasks.oralDoneToday, label: "口算一组", hint: "每天 10 题，3 分钟", node: tasks.oralDoneToday ? null : <StartPracticeButton kind="oral" count={10} timeLimitSec={180} label="开始" className="btn-primary text-sm" /> },
    { done: tasks.newMistakes === 0, label: `新错题 ${tasks.newMistakes} 道要讲解`, hint: "看动画或和老师聊聊", node: tasks.newMistakes > 0 ? <Link href="/child/mistakes" className="btn-primary text-sm">去看</Link> : null },
    { done: tasks.explained.length === 0, label: `${tasks.explained.length} 道错题等着消灭`, hint: "讲过了就做 3 道变式题", node: tasks.explained.length > 0 ? <Link href="/child/mistakes" className="btn-primary text-sm">去做</Link> : null },
    { done: tasks.due.length === 0, label: `复习 ${tasks.due.length} 道`, hint: "按 1/3/7/15/30 天回来看看", node: tasks.due.length > 0 ? <Link href="/child/practice" className="btn-primary text-sm">去复习</Link> : null },
    ...(tasks.readySets.filter((s) => s.kind === "ai").length > 0
      ? [{ done: false, label: `爸爸妈妈布置的练习 ${tasks.readySets.filter((s) => s.kind === "ai").length} 组`, hint: "", node: <Link href="/child/practice" className="btn-primary text-sm">去做</Link> }]
      : []),
  ];
  const doneCount = todo.filter((t) => t.done).length;

  return (
    <div className="space-y-5">
      <div className="card bg-gradient-to-br from-orange-100 to-amber-50 border-orange-100 flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold">你好，{child.name}！</p>
          <p className="text-gray-600 mt-1">连续学习 <b className="text-orange-600 text-xl">{streak}</b> 天 🔥</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">今日任务</p>
          <p className="text-2xl font-bold">{doneCount}/{todo.length}</p>
        </div>
      </div>

      <section className="card">
        <h2 className="font-semibold mb-2">📋 今天要做的</h2>
        <ul className="divide-y">
          {todo.map((t, i) => (
            <li key={i} className="py-2.5 flex items-center gap-3">
              <span className={`text-xl ${t.done ? "" : "opacity-40"}`}>{t.done ? "✅" : "⬜"}</span>
              <div className="flex-1">
                <p className={t.done ? "line-through text-gray-400" : "font-medium"}>{t.label}</p>
                {t.hint && !t.done && <p className="text-xs text-gray-500">{t.hint}</p>}
              </div>
              {!t.done && t.node}
            </li>
          ))}
        </ul>
        {doneCount === todo.length && <p className="text-center text-green-700 mt-3">今天的任务全部完成，太棒了！🎉</p>}
      </section>

      <div className="grid grid-cols-3 gap-3">
        <Link href="/child/upload" className="card text-center py-6 hover:shadow-md active:scale-95 transition">
          <div className="text-4xl">📷</div>
          <div className="mt-2 font-semibold">拍作业</div>
        </Link>
        <Link href="/child/practice" className="card text-center py-6 hover:shadow-md active:scale-95 transition">
          <div className="text-4xl">🧮</div>
          <div className="mt-2 font-semibold">练习</div>
        </Link>
        <Link href="/child/mistakes" className="card text-center py-6 hover:shadow-md active:scale-95 transition">
          <div className="text-4xl">🎯</div>
          <div className="mt-2 font-semibold">错题本</div>
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
