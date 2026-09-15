import { requireParent } from "@/lib/auth";
import { REWARD_EMOJIS, allRewards, pendingRedemptions } from "@/lib/shop";
import { addRewardAction, cancelRedemptionAction, completeRedemptionAction, deleteRewardAction, toggleRewardAction } from "@/app/actions/rewards";

export default async function RewardsPage() {
  const s = await requireParent();
  const [rewards, pending] = await Promise.all([allRewards(s.familyId), pendingRedemptions(s.familyId)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">奖励兑换</h1>
        <p className="text-sm text-gray-500 mt-1">孩子用攒下的星星在「星星商店」兑换；兑换后会出现在下方「待兑现」，由你确认。</p>
      </div>

      <section className="card">
        <h2 className="font-semibold mb-3">待兑现 {pending.length > 0 && <span className="badge bg-amber-100 text-amber-800 ml-1">{pending.length}</span>}</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-500">暂时没有待兑现的申请。</p>
        ) : (
          <ul className="divide-y">
            {pending.map((r) => (
              <li key={r.id} className="py-3 flex flex-wrap items-center gap-3">
                <span className="text-3xl">{r.reward.emoji}</span>
                <div className="flex-1 min-w-40">
                  <p className="font-semibold">
                    {r.child.avatar} {r.child.name} 想要「{r.reward.title}」
                  </p>
                  <p className="text-xs text-gray-500">
                    花了 ⭐ {r.stars} · {r.createdAt.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <form action={completeRedemptionAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn-leaf text-sm">✅ 已兑现</button>
                </form>
                <form action={cancelRedemptionAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn-danger text-sm">取消并退回星星</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="font-semibold mb-3">添加奖励</h2>
        <form action={addRewardAction} className="space-y-3">
          <div className="grid sm:grid-cols-[1fr_140px] gap-3">
            <div>
              <label className="label" htmlFor="reward-title">奖励名称</label>
              <input id="reward-title" name="title" className="input" placeholder="例如：看 30 分钟动画片" required maxLength={40} />
            </div>
            <div>
              <label className="label" htmlFor="reward-stars">需要星星</label>
              <input id="reward-stars" name="stars" type="number" min={1} max={100000} defaultValue={50} className="input" required />
            </div>
          </div>
          <div>
            <span className="label">图标</span>
            <div className="flex flex-wrap gap-2">
              {REWARD_EMOJIS.map((e, i) => (
                <label key={e} className="chip cursor-pointer text-2xl px-3 py-1.5 has-checked:border-brand has-checked:bg-brand-soft">
                  <input type="radio" name="emoji" value={e} defaultChecked={i === 0} className="sr-only" />
                  {e}
                </label>
              ))}
            </div>
          </div>
          <button className="btn-primary">+ 添加</button>
        </form>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-3">奖励列表</h2>
        {rewards.length === 0 ? (
          <p className="text-sm text-gray-500">还没有奖励，先在上面添加一个吧。</p>
        ) : (
          <ul className="divide-y">
            {rewards.map((r) => (
              <li key={r.id} className={`py-3 flex flex-wrap items-center gap-3 ${r.active ? "" : "opacity-60"}`}>
                <span className="text-3xl">{r.emoji}</span>
                <div className="flex-1 min-w-40">
                  <p className="font-semibold">
                    {r.title} {!r.active && <span className="badge bg-gray-100 text-gray-500 ml-1">已停用</span>}
                  </p>
                  <p className="text-xs text-gray-500">⭐ {r.stars} 颗星星</p>
                </div>
                <form action={toggleRewardAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn-secondary text-sm">{r.active ? "停用" : "启用"}</button>
                </form>
                <form action={deleteRewardAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn-danger text-sm">删除</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
