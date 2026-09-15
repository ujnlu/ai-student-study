"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { redeemRewardAction } from "@/app/actions/rewards";
import { Confetti, useSfx } from "@/components/fx";

export function RedeemButton({ rewardId, title, cost, balance }: { rewardId: string; title: string; cost: number; balance: number }) {
  const router = useRouter();
  const play = useSfx();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const short = cost - balance;

  if (done) {
    return (
      <div className="anim-pop text-center">
        <Confetti trigger />
        <p className="font-extrabold text-leaf-dark">🎉 兑换成功！</p>
        <p className="text-xs text-muted mt-0.5">去找爸爸妈妈领「{title}」吧</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-1">
      <button
        type="button"
        className="btn-primary text-base w-full"
        disabled={pending || short > 0}
        onClick={() => {
          setErr(null);
          play("tap");
          start(async () => {
            const r = await redeemRewardAction(rewardId);
            if (r.ok) {
              play("win");
              setDone(true);
              router.refresh();
            } else {
              play("wrong");
              setErr(r.error);
            }
          });
        }}
      >
        {pending ? "兑换中…" : short > 0 ? `还差 ${short} 颗` : "🎁 兑换"}
      </button>
      {err && <span className="text-xs text-berry text-center">{err}</span>}
    </div>
  );
}
