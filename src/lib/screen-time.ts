/** 每日学习时长（粗略估算）与家庭上限 */
import { db } from "@/lib/db";

const UPLOAD_MIN = 3; // 拍一次作业约 3 分钟
const CONVERSATION_MIN = 4; // 一次讲解对话约 4 分钟

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 今天已学分钟数：练习用时 + 上传 ×3 + 对话 ×4 */
export async function todayMinutes(childId: string) {
  const since = startOfToday();
  const [practice, uploads, conversations] = await Promise.all([
    db.practiceSet.aggregate({ where: { childId, status: "done", completedAt: { gte: since } }, _sum: { durationSec: true } }),
    db.upload.count({ where: { childId, createdAt: { gte: since } } }),
    db.conversation.count({ where: { childId, updatedAt: { gte: since } } }),
  ]);
  const practiceMin = (practice._sum.durationSec ?? 0) / 60;
  return Math.round(practiceMin + uploads * UPLOAD_MIN + conversations * CONVERSATION_MIN);
}

/** 家庭设置的每日上限（分钟），0 表示不限制 */
export async function limitMinutes(familyId: string) {
  const f = await db.family.findUnique({ where: { id: familyId }, select: { dailyLimitMin: true } });
  return f?.dailyLimitMin ?? 60;
}

export type ScreenTimeStatus = { minutes: number; limit: number; ratio: number; over: boolean };

export async function screenTimeStatus(childId: string, familyId: string): Promise<ScreenTimeStatus> {
  const [minutes, limit] = await Promise.all([todayMinutes(childId), limitMinutes(familyId)]);
  const ratio = limit > 0 ? minutes / limit : 0;
  return { minutes, limit, ratio, over: limit > 0 && minutes >= limit };
}
