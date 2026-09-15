import Link from "next/link";
import { requireChild } from "@/lib/auth";
import { totalStars } from "@/lib/rewards";
import { REDEMPTION_STATUS, activeRewards, childRedemptions } from "@/lib/shop";
import { MascotSays } from "@/components/mascot";
import { RedeemButton } from "@/components/redeem-button";

export default async function ShopPage() {
  const { child } = await requireChild();
  const [stars, rewards, history] = await Promise.all([totalStars(child.id), activeRewards(child.familyId), childRedemptions(child.id)]);
  const cheapest = rewards[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🛒 星星商店</h1>
        <Link href="/child/me" className="text-sm text-gray-500 underline">我的星星</Link>
      </div>

      <div className="card bg-gradient-to-br from-amber-100 via-orange-50 to-white border-orange-100 flex items-center gap-4">
        <span className="text-5xl">⭐</span>
        <div>
          <p className="text-sm text-muted font-bold">我有</p>
          <p className="text-4xl h-display text-brand-dark">{stars} <span className="text-lg">颗星星</span></p>
        </div>
      </div>

      {rewards.length === 0 ? (
        <MascotSays mood="think">商店还是空的，让爸爸妈妈先添加几样奖励吧！</MascotSays>
      ) : (
        <>
          <MascotSays mood={cheapest && stars >= cheapest.stars ? "cheer" : "happy"}>
            {cheapest && stars >= cheapest.stars ? "星星够啦，挑一个喜欢的奖励吧！" : `再攒 ${cheapest.stars - stars} 颗星星就能换「${cheapest.title}」啦！`}
          </MascotSays>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {rewards.map((r) => {
              const ok = stars >= r.stars;
              return (
                <div key={r.id} className={`card flex flex-col items-center gap-2 text-center ${ok ? "border-brand/40" : ""}`}>
                  <span className="text-6xl leading-none">{r.emoji}</span>
                  <p className="font-extrabold text-lg leading-tight">{r.title}</p>
                  <p className={`badge text-sm ${ok ? "bg-bee-soft text-bee-dark" : "bg-gray-100 text-gray-500"}`}>⭐ {r.stars}</p>
                  <div className="w-full mt-auto">
                    <RedeemButton rewardId={r.id} title={r.title} cost={r.stars} balance={stars} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <section className="card">
        <h2 className="font-semibold mb-2">🧾 我的兑换</h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-500">还没有兑换过，攒够星星就来换吧！</p>
        ) : (
          <ul className="divide-y text-sm">
            {history.map((h) => {
              const st = REDEMPTION_STATUS[h.status] ?? { label: h.status, cls: "bg-gray-100" };
              return (
                <li key={h.id} className="py-2 flex items-center gap-2">
                  <span className="text-2xl">{h.reward.emoji}</span>
                  <div className="flex-1">
                    <p className="font-semibold">{h.reward.title}</p>
                    <p className="text-xs text-gray-400">{h.createdAt.toLocaleDateString("zh-CN")} · ⭐ {h.stars}</p>
                  </div>
                  <span className={`badge ${st.cls}`}>{st.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
