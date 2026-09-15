"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";

/** 设置每日学习时长上限（分钟）；0 = 不限制 */
export async function setDailyLimitAction(formData: FormData) {
  const s = await requireParent();
  const raw = Number(formData.get("dailyLimitMin") ?? 60);
  const minutes = Number.isFinite(raw) ? Math.min(600, Math.max(0, Math.round(raw))) : 60;
  await db.family.update({ where: { id: s.familyId }, data: { dailyLimitMin: minutes } });
  revalidatePath("/parent/screen-time");
  revalidatePath("/child", "layout");
}
