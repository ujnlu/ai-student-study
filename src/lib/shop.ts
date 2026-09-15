/** 星星商店：奖励 / 兑换 的查询与扣星辅助（不改动 rewards.ts） */
import { db } from "@/lib/db";

/** 家长添加奖励时可选的表情 */
export const REWARD_EMOJIS = ["🎁", "🍦", "🎮", "📺", "🎢", "🧸", "🍕", "📚", "⚽", "🎨", "🚲", "🌟"] as const;

export const REDEMPTION_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "等爸爸妈妈兑现", cls: "bg-bee-soft text-bee-dark" },
  done: { label: "已兑现", cls: "bg-leaf-soft text-leaf-dark" },
  cancelled: { label: "已取消 · 星星退回", cls: "bg-gray-100 text-gray-500" },
};

/** 扣星星（负数流水）。addStars 只接受正数，这里单独写。 */
export async function spendStars(childId: string, cost: number, reason: string) {
  if (cost <= 0) return;
  await db.starEvent.create({ data: { childId, amount: -cost, reason } });
}

/** 孩子可见的奖励（仅启用） */
export function activeRewards(familyId: string) {
  return db.reward.findMany({ where: { familyId, active: true }, orderBy: [{ stars: "asc" }, { createdAt: "asc" }] });
}

/** 家长视角的全部奖励 */
export function allRewards(familyId: string) {
  return db.reward.findMany({ where: { familyId }, orderBy: [{ active: "desc" }, { stars: "asc" }, { createdAt: "asc" }] });
}

/** 孩子的兑换记录 */
export function childRedemptions(childId: string, take = 20) {
  return db.redemption.findMany({ where: { childId }, include: { reward: true }, orderBy: { createdAt: "desc" }, take });
}

/** 家庭内待兑现的申请 */
export function pendingRedemptions(familyId: string) {
  return db.redemption.findMany({
    where: { status: "pending", reward: { familyId } },
    include: { reward: true, child: { select: { id: true, name: true, avatar: true } } },
    orderBy: { createdAt: "asc" },
  });
}
