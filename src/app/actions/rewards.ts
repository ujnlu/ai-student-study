"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireParent, getSession } from "@/lib/auth";
import { addStars, totalStars } from "@/lib/rewards";
import { REWARD_EMOJIS } from "@/lib/shop";

function revalidateAll() {
  revalidatePath("/parent/rewards");
  revalidatePath("/child/shop");
  revalidatePath("/child", "layout");
}

// ---------- 家长：奖励管理 ----------

export async function addRewardAction(formData: FormData) {
  const s = await requireParent();
  const title = String(formData.get("title") ?? "").trim();
  const stars = Math.round(Number(formData.get("stars") ?? 0));
  const emojiRaw = String(formData.get("emoji") ?? "🎁");
  const emoji = (REWARD_EMOJIS as readonly string[]).includes(emojiRaw) ? emojiRaw : "🎁";
  if (!title || !Number.isFinite(stars) || stars <= 0) return;
  await db.reward.create({ data: { familyId: s.familyId, title: title.slice(0, 40), emoji, stars: Math.min(stars, 100000) } });
  revalidateAll();
}

export async function toggleRewardAction(formData: FormData) {
  const s = await requireParent();
  const id = String(formData.get("id") ?? "");
  const r = await db.reward.findFirst({ where: { id, familyId: s.familyId } });
  if (!r) return;
  await db.reward.update({ where: { id }, data: { active: !r.active } });
  revalidateAll();
}

export async function deleteRewardAction(formData: FormData) {
  const s = await requireParent();
  const id = String(formData.get("id") ?? "");
  await db.reward.deleteMany({ where: { id, familyId: s.familyId } });
  revalidateAll();
}

// ---------- 家长：兑现 / 取消 ----------

export async function completeRedemptionAction(formData: FormData) {
  const s = await requireParent();
  const id = String(formData.get("id") ?? "");
  const r = await db.redemption.findFirst({ where: { id, status: "pending", reward: { familyId: s.familyId } } });
  if (!r) return;
  await db.redemption.update({ where: { id }, data: { status: "done", doneAt: new Date() } });
  revalidateAll();
}

export async function cancelRedemptionAction(formData: FormData) {
  const s = await requireParent();
  const id = String(formData.get("id") ?? "");
  const r = await db.redemption.findFirst({ where: { id, status: "pending", reward: { familyId: s.familyId } } });
  if (!r) return;
  await db.redemption.update({ where: { id }, data: { status: "cancelled" } });
  await addStars(r.childId, r.stars, "兑换取消退回");
  revalidateAll();
}

// ---------- 孩子：兑换 ----------

export type RedeemResult = { ok: true; balance: number; title: string } | { ok: false; error: string };

export async function redeemRewardAction(rewardId: string): Promise<RedeemResult> {
  const s = await getSession();
  if (!s || s.role !== "child" || !s.childId) return { ok: false, error: "请先登录" };
  const child = await db.child.findUnique({ where: { id: s.childId }, select: { id: true, familyId: true } });
  if (!child) return { ok: false, error: "请先登录" };
  const reward = await db.reward.findFirst({ where: { id: String(rewardId), familyId: child.familyId, active: true } });
  if (!reward) return { ok: false, error: "这个奖励下架啦" };
  const balance = await totalStars(child.id);
  if (balance < reward.stars) return { ok: false, error: `还差 ${reward.stars - balance} 颗星星哦` };
  await db.$transaction([
    db.redemption.create({ data: { childId: child.id, rewardId: reward.id, stars: reward.stars } }),
    db.starEvent.create({ data: { childId: child.id, amount: -reward.stars, reason: `兑换：${reward.title}` } }),
  ]);
  revalidateAll();
  return { ok: true, balance: balance - reward.stars, title: reward.title };
}
