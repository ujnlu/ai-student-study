import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { opponentSpeedSec, pkWinReason } from "@/lib/pk";
import { PkPlayer } from "@/components/pk-player";
import { Mascot } from "@/components/mascot";
import { StartFlowButton } from "@/components/start-flow-button";

export default async function PkSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { child } = await requireChild();
  const { id } = await params;
  const set = await db.practiceSet.findFirst({
    where: { id, childId: child.id, kind: "pk" },
    include: { items: { include: { problem: { select: { stem: true } } }, orderBy: { index: "asc" } } },
  });
  if (!set) notFound();

  if (set.status === "done") {
    const won = !!(await db.starEvent.findFirst({ where: { childId: child.id, reason: pkWinReason(set.id) } }));
    return (
      <div className="space-y-4">
        <div className={`card text-center py-8 ${won ? "bg-bee-soft border-bee" : "bg-sky-soft border-sky/40"}`}>
          <Mascot mood={won ? "cheer" : "sad"} size={110} />
          <p className="text-3xl h-display mt-3">{won ? "🏆 这局你赢了橙橙" : "这局橙橙赢了"}</p>
          <p className="text-muted font-bold mt-2">答对 {set.score} / {set.total} 题{set.durationSec ? ` · 用时 ${set.durationSec} 秒` : ""}</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-center">
          <StartFlowButton url="/api/pk" body={{ count: set.total }} redirect="/child/pk/{id}" label="再来一局 🔁" busyLabel="出题中…" className="btn-primary text-lg" />
          <Link href="/child/pk" className="btn-secondary">回到 PK</Link>
          <Link href="/child" className="btn-secondary">回首页</Link>
        </div>
      </div>
    );
  }

  return (
    <PkPlayer
      key={set.id}
      setId={set.id}
      items={set.items.map((it) => ({ index: it.index, stem: it.problem.stem }))}
      opponentSpeedSec={opponentSpeedSec(child.grade)}
      childName={child.name}
      childAvatar={child.avatar}
    />
  );
}
