import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { screenTimeStatus } from "@/lib/screen-time";
import { setDailyLimitAction } from "@/app/actions/screen-time";

export default async function ScreenTimePage() {
  const s = await requireParent();
  const [family, children] = await Promise.all([
    db.family.findUniqueOrThrow({ where: { id: s.familyId }, select: { dailyLimitMin: true } }),
    db.child.findMany({ where: { familyId: s.familyId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, avatar: true } }),
  ]);
  const statuses = await Promise.all(children.map((c) => screenTimeStatus(c.id, s.familyId)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">每日时长</h1>
        <p className="text-sm text-gray-500 mt-1">学到约定时长的 70% 时孩子端会出现温和提醒，到 100% 会提示休息（不会锁定，只是提醒）。</p>
      </div>

      <section className="card">
        <h2 className="font-semibold mb-3">每日上限</h2>
        <form action={setDailyLimitAction} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="limit">每天最多学习（分钟）</label>
            <input id="limit" name="dailyLimitMin" type="number" min={0} max={600} step={5} defaultValue={family.dailyLimitMin} className="input w-40" />
          </div>
          <button className="btn-primary">保存</button>
          <p className="text-xs text-gray-500 basis-full">填 0 表示不提醒。当前：{family.dailyLimitMin > 0 ? `${family.dailyLimitMin} 分钟` : "不限制"}</p>
        </form>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-1">今天已学</h2>
        <p className="text-xs text-gray-500 mb-3">粗略估算：练习实际用时 + 每次拍作业约 3 分钟 + 每次讲解对话约 4 分钟。</p>
        {children.length === 0 ? (
          <p className="text-sm text-gray-500">还没有添加孩子。</p>
        ) : (
          <ul className="space-y-3">
            {children.map((c, i) => {
              const st = statuses[i];
              const pct = st.limit > 0 ? Math.min(100, Math.round(st.ratio * 100)) : 0;
              const color = st.over ? "bg-berry" : st.ratio >= 0.7 ? "bg-bee" : "bg-leaf";
              return (
                <li key={c.id} className="flex items-center gap-4">
                  <span className="text-3xl">{c.avatar}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold">{c.name}</span>
                      <span className={st.over ? "text-berry font-semibold" : "text-gray-600"}>
                        {st.minutes} 分钟{st.limit > 0 ? ` / ${st.limit}` : ""}
                        {st.over && " · 已超"}
                      </span>
                    </div>
                    <div className="bar mt-1.5">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
