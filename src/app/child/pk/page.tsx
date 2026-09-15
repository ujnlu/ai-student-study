import Link from "next/link";
import { requireChild } from "@/lib/auth";
import { db } from "@/lib/db";
import { opponentSpeedSec, PK_WIN_STARS } from "@/lib/pk";
import { Mascot } from "@/components/mascot";
import { StartFlowButton } from "@/components/start-flow-button";

export default async function PkIntroPage() {
  const { child } = await requireChild();
  const speed = opponentSpeedSec(child.grade);
  const [wins, played] = await Promise.all([
    db.starEvent.count({ where: { childId: child.id, reason: { startsWith: "PK 获胜 " } } }),
    db.practiceSet.count({ where: { childId: child.id, kind: "pk", status: "done" } }),
  ]);
  return (
    <div className="space-y-5">
      <div className="card bg-gradient-to-br from-orange-100 via-amber-50 to-white border-orange-200 text-center py-8">
        <Mascot mood="cheer" size={140} className="anim-float" />
        <h1 className="text-3xl h-display mt-3">🏁 口算 PK · 和橙橙比赛</h1>
        <p className="text-muted font-bold mt-2">10 道口算，看谁先做完！</p>
        <div className="mt-5">
          <StartFlowButton url="/api/pk" body={{ count: 10 }} redirect="/child/pk/{id}" label="开始 PK 🚀" busyLabel="出题中…" className="btn-primary text-2xl px-10 py-4" />
        </div>
        {played > 0 && (
          <p className="text-sm text-muted mt-4">
            已经比了 <b className="text-brand-dark">{played}</b> 局，赢了 <b className="text-brand-dark">{wins}</b> 局
          </p>
        )}
      </div>

      <section className="card">
        <h2 className="text-xl h-display mb-3">📜 比赛规则</h2>
        <ul className="space-y-2 font-bold text-[15px]">
          <li className="flex gap-2"><span>1️⃣</span><span>你和橙橙各做同样的 10 道口算，不限时间。</span></li>
          <li className="flex gap-2"><span>2️⃣</span><span>橙橙大约 <b className="text-sky">{speed} 秒</b>做一题，偶尔也会卡壳想一想。</span></li>
          <li className="flex gap-2"><span>3️⃣</span><span>每题答完立刻判对错：答对马上下一题，答错看一眼正确答案再继续，不能重做。</span></li>
          <li className="flex gap-2"><span>4️⃣</span><span>比橙橙先做完，而且答对 7 题以上，就赢啦！要是答对的题比橙橙做过的还多，也算赢。</span></li>
          <li className="flex gap-2"><span>⭐</span><span>每答对 1 题 +1 星，全对再 +10 星，赢了橙橙还有 <b className="text-brand-dark">+{PK_WIN_STARS}</b> 星！</span></li>
        </ul>
      </section>

      <div className="text-center">
        <Link href="/child/practice" className="btn-ghost">← 返回练习</Link>
      </div>
    </div>
  );
}
