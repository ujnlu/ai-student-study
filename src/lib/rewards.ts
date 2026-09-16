/** 星星、徽章、打卡日历 */
import { db } from "@/lib/db";

export const STAR_RULES = {
  upload: 5, // 拍一次作业
  practiceCorrect: 1, // 每答对一题
  practicePerfect: 10, // 一组全对
  syncDone: 5, // 完成一组同步练
  understood: 3, // 看完讲解说"我懂了"
  mistakeCleared: 8, // 消灭一道错题
  reviewPass: 5, // 复习通过
  dailyAll: 20, // 今日任务全部完成
  olympiadDone: 5, // 完成一组奥数专题
  speakingPass: 6, // 英语跟读平均 80% 以上
};

export async function addStars(childId: string, amount: number, reason: string) {
  if (amount <= 0) return;
  await db.starEvent.create({ data: { childId, amount, reason } });
}

export async function totalStars(childId: string) {
  const r = await db.starEvent.aggregate({ where: { childId }, _sum: { amount: true } });
  return r._sum.amount ?? 0;
}

export function levelOf(stars: number) {
  const levels = [
    { name: "小种子", min: 0, emoji: "🌱" },
    { name: "小树苗", min: 50, emoji: "🌿" },
    { name: "小树", min: 150, emoji: "🌳" },
    { name: "大树", min: 400, emoji: "🌲" },
    { name: "森林之王", min: 900, emoji: "🦁" },
    { name: "星星队长", min: 1800, emoji: "⭐" },
  ];
  let cur = levels[0];
  let next: (typeof levels)[number] | null = null;
  for (let i = 0; i < levels.length; i++) {
    if (stars >= levels[i].min) {
      cur = levels[i];
      next = levels[i + 1] ?? null;
    }
  }
  return { ...cur, next, progress: next ? Math.round(((stars - cur.min) / (next.min - cur.min)) * 100) : 100 };
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 有学习活动的日期集合（最近 N 天） */
export async function activeDays(childId: string, days = 60) {
  const since = new Date(Date.now() - days * 86400_000);
  const [ups, sets, convs] = await Promise.all([
    db.upload.findMany({ where: { childId, createdAt: { gte: since } }, select: { createdAt: true } }),
    db.practiceSet.findMany({ where: { childId, status: "done", completedAt: { gte: since } }, select: { completedAt: true } }),
    db.conversation.findMany({ where: { childId, updatedAt: { gte: since } }, select: { updatedAt: true } }),
  ]);
  const set = new Set<string>();
  for (const u of ups) set.add(dayKey(u.createdAt));
  for (const s of sets) if (s.completedAt) set.add(dayKey(s.completedAt));
  for (const c of convs) set.add(dayKey(c.updatedAt));
  return set;
}

export function streakFrom(days: Set<string>) {
  const d = new Date();
  let streak = 0;
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export type Badge = { id: string; name: string; emoji: string; desc: string; earned: boolean; progress?: string };

export async function badges(childId: string): Promise<Badge[]> {
  const [days, cleared, perfect, uploads, stars, syncDone, explained, olympiad, speaking] = await Promise.all([
    activeDays(childId, 365),
    db.mistakeEntry.count({ where: { childId, status: "cleared" } }),
    db.practiceSet.count({ where: { childId, status: "done", total: { gt: 0 }, score: { gt: 0 } } }).then(async () => {
      const sets = await db.practiceSet.findMany({ where: { childId, status: "done" }, select: { score: true, total: true } });
      return sets.filter((s) => s.total > 0 && s.score === s.total).length;
    }),
    db.upload.count({ where: { childId, status: "graded" } }),
    totalStars(childId),
    db.practiceSet.count({ where: { childId, kind: "sync", status: "done" } }),
    db.explanation.count({ where: { childId, status: "ready" } }),
    db.practiceSet.count({ where: { childId, kind: "olympiad", status: "done" } }),
    db.recitation.count({ where: { childId, kind: "speaking", accuracy: { gte: 80 } } }),
  ]);
  const streak = streakFrom(days);
  const total = days.size;
  return [
    { id: "first", name: "初次见面", emoji: "👋", desc: "完成第一次学习", earned: total >= 1 },
    { id: "streak3", name: "三日之约", emoji: "🔥", desc: "连续学习 3 天", earned: streak >= 3, progress: `${Math.min(streak, 3)}/3` },
    { id: "streak7", name: "一周不断", emoji: "🏅", desc: "连续学习 7 天", earned: streak >= 7, progress: `${Math.min(streak, 7)}/7` },
    { id: "streak30", name: "月度冠军", emoji: "🏆", desc: "连续学习 30 天", earned: streak >= 30, progress: `${Math.min(streak, 30)}/30` },
    { id: "perfect1", name: "全对！", emoji: "💯", desc: "一组练习全部答对", earned: perfect >= 1 },
    { id: "perfect10", name: "十全十美", emoji: "🎯", desc: "10 组练习全对", earned: perfect >= 10, progress: `${Math.min(perfect, 10)}/10` },
    { id: "clear5", name: "错题猎人", emoji: "🧹", desc: "消灭 5 道错题", earned: cleared >= 5, progress: `${Math.min(cleared, 5)}/5` },
    { id: "clear30", name: "错题克星", emoji: "⚔️", desc: "消灭 30 道错题", earned: cleared >= 30, progress: `${Math.min(cleared, 30)}/30` },
    { id: "upload10", name: "作业达人", emoji: "📷", desc: "拍 10 次作业", earned: uploads >= 10, progress: `${Math.min(uploads, 10)}/10` },
    { id: "sync10", name: "同步小能手", emoji: "📚", desc: "完成 10 组同步练", earned: syncDone >= 10, progress: `${Math.min(syncDone, 10)}/10` },
    { id: "explain5", name: "爱看讲解", emoji: "🎬", desc: "看 5 次动画讲解", earned: explained >= 5, progress: `${Math.min(explained, 5)}/5` },
    { id: "star500", name: "星星富翁", emoji: "🌟", desc: "攒到 500 颗星星", earned: stars >= 500, progress: `${Math.min(stars, 500)}/500` },
    { id: "olympiad5", name: "思维小达人", emoji: "🧠", desc: "完成 5 组奥数专题", earned: olympiad >= 5, progress: `${Math.min(olympiad, 5)}/5` },
    { id: "speak5", name: "英语小喇叭", emoji: "📣", desc: "5 次英语跟读达到 80%", earned: speaking >= 5, progress: `${Math.min(speaking, 5)}/5` },
  ];
}
