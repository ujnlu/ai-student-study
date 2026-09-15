import { requireChild } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeDays, badges, levelOf, streakFrom, totalStars } from "@/lib/rewards";

export default async function MePage() {
  const { child } = await requireChild();
  const [stars, days, badgeList, recent] = await Promise.all([
    totalStars(child.id),
    activeDays(child.id, 90),
    badges(child.id),
    db.starEvent.findMany({ where: { childId: child.id }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const level = levelOf(stars);
  const streak = streakFrom(days);
  const earned = badgeList.filter((b) => b.earned);

  // 本月日历
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const pad = (first.getDay() + 6) % 7; // 周一开头
  const key = (d: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const monthActive = Array.from({ length: daysInMonth }, (_, i) => days.has(key(i + 1))).filter(Boolean).length;

  return (
    <div className="space-y-5">
      <div className="card bg-gradient-to-br from-amber-100 via-orange-50 to-white border-orange-100">
        <div className="flex items-center gap-4">
          <div className="text-6xl">{child.avatar}</div>
          <div className="flex-1">
            <p className="text-2xl font-bold">{child.name}</p>
            <p className="text-gray-600">
              {level.emoji} {level.name} · <b className="text-orange-600">⭐ {stars}</b> 颗星星
            </p>
            {level.next && (
              <div className="mt-2">
                <div className="h-2.5 rounded-full bg-white/70 overflow-hidden">
                  <div className="h-full bg-orange-400 rounded-full" style={{ width: `${level.progress}%` }} />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  再攒 {level.next.min - stars} 颗星星升级为 {level.next.emoji} {level.next.name}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="card py-4"><p className="text-3xl font-bold text-orange-600">{streak}</p><p className="text-xs text-gray-500">连续天数 🔥</p></div>
        <div className="card py-4"><p className="text-3xl font-bold text-blue-600">{monthActive}</p><p className="text-xs text-gray-500">本月学习天数</p></div>
        <div className="card py-4"><p className="text-3xl font-bold text-green-600">{earned.length}</p><p className="text-xs text-gray-500">获得徽章</p></div>
      </div>

      <section className="card">
        <h2 className="font-semibold mb-3">📅 {month + 1} 月打卡</h2>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-1">
          {["一", "二", "三", "四", "五", "六", "日"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: pad }).map((_, i) => <div key={`p${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
            const active = days.has(key(d));
            const today = d === now.getDate();
            return (
              <div key={d} className={`aspect-square rounded-lg flex items-center justify-center text-sm ${active ? "bg-orange-400 text-white font-bold" : "bg-gray-100 text-gray-400"} ${today ? "ring-2 ring-orange-300" : ""}`}>
                {active ? "★" : d}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-3">🏅 徽章</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {badgeList.map((b) => (
            <div key={b.id} className={`rounded-xl p-3 text-center border ${b.earned ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-100 opacity-60"}`}>
              <div className={`text-4xl ${b.earned ? "" : "grayscale"}`}>{b.emoji}</div>
              <p className="text-sm font-semibold mt-1">{b.name}</p>
              <p className="text-[11px] text-gray-500">{b.desc}</p>
              {!b.earned && b.progress && <p className="text-[11px] text-orange-600 mt-0.5">{b.progress}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-2">⭐ 最近获得的星星</h2>
        <ul className="divide-y text-sm">
          {recent.length === 0 && <li className="py-2 text-gray-500">还没有星星，去拍作业或做练习吧！</li>}
          {recent.map((e) => (
            <li key={e.id} className="py-1.5 flex justify-between">
              <span>{e.reason}</span>
              <span className="text-orange-600 font-semibold">+{e.amount}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
