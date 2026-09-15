"use client";

import { Mascot } from "@/components/mascot";

/**
 * 每日时长提醒：<70% 不显示；≥70% 黄色提示条；≥100% 红色休息卡（不拦截使用）
 */
export function ScreenTimeBanner({ minutes, limit }: { minutes: number; limit: number }) {
  if (!limit || limit <= 0) return null;
  const ratio = minutes / limit;
  if (ratio < 0.7) return null;

  if (ratio >= 1) {
    return (
      <div className="mb-4 rounded-3xl border-2 border-berry/30 bg-berry-soft p-4 flex items-center gap-4 anim-pop">
        <Mascot mood="sleep" size={84} className="shrink-0" />
        <div className="flex-1">
          <p className="text-lg font-extrabold text-berry-dark">今天学得够多了，眼睛休息一下，明天再来！</p>
          <p className="text-sm text-muted mt-1">今天已经学了 {minutes} 分钟（约定 {limit} 分钟）</p>
        </div>
      </div>
    );
  }

  const pct = Math.min(100, Math.round(ratio * 100));
  return (
    <div className="mb-4 rounded-2xl border-2 border-bee/40 bg-bee-soft px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-extrabold text-bee-dark">
        <span className="text-xl">⏰</span>
        <span>今天已经学了 {minutes} 分钟，再学一会儿就休息哦</span>
      </div>
      <div className="mt-2 h-2.5 w-full rounded-full bg-white/70 overflow-hidden">
        <div className="h-full rounded-full bg-bee transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
