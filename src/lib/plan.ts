/**
 * 本周计划（参考学而思"智慧学 / 学习计划"）：不调 AI，按孩子所在级与板块自动定目标，统计本周完成度。
 */
import { db } from "@/lib/db";
import { lecturesOfLevel, olympiadLevel, topicStats, topicsFor } from "@/lib/topics";

export type PlanItem = { key: string; icon: string; label: string; hint: string; href: string; done: number; target: number };

function weekStart() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // 周一 = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function weeklyPlan(child: { id: string; grade: number; semester: number }): Promise<PlanItem[]> {
  const since = weekStart();
  const level = olympiadLevel(child.grade, child.semester);
  const lectures = lecturesOfLevel(level);
  const [sets, speaking, weekly, stats] = await Promise.all([
    db.practiceSet.findMany({ where: { childId: child.id, status: "done", completedAt: { gte: since }, topic: { not: null } }, select: { topic: true, kind: true } }),
    db.recitation.count({ where: { childId: child.id, kind: "speaking", createdAt: { gte: since } } }),
    db.practiceSet.count({ where: { childId: child.id, status: "done", completedAt: { gte: since }, kind: { in: ["weekly", "unit"] } } }),
    topicStats(
      child.id,
      lectures.map((l) => l.code),
    ),
  ]);
  const nextLecture = lectures.find((l) => !(stats.get(l.code)?.sets ?? 0)) ?? lectures[0];
  const count = (pred: (topic: string, kind: string) => boolean) => new Set(sets.filter((s) => pred(s.topic!, s.kind)).map((s) => s.topic!)).size;
  const cnTopics = topicsFor("special", "chinese", child.grade);
  const enTopics = topicsFor("special", "english", child.grade);
  const items: PlanItem[] = [
    {
      key: "oly",
      icon: "🧠",
      label: "奥数 2 讲",
      hint: nextLecture ? `第 ${level} 级 · 接下来第 ${nextLecture.no} 讲 ${nextLecture.name}` : "",
      href: nextLecture ? `/child/topic/${nextLecture.code}` : "/child/olympiad",
      done: count((t, k) => k === "olympiad"),
      target: 2,
    },
    { key: "cn", icon: "📚", label: "语文读写 2 个", hint: "基础 · 阅读 · 文学各挑一个", href: cnTopics[0] ? "/child/special?subject=chinese" : "/child?s=chinese", done: count((t) => t.startsWith("special-chinese-")), target: 2 },
    { key: "en", icon: "🗣️", label: "英语跟读 2 次", hint: "听一句读一句", href: "/child/speaking", done: speaking, target: 2 },
    { key: "en2", icon: "🔤", label: "英语专项 1 个", hint: "词汇 · 语法 · 听力", href: enTopics[0] ? "/child/special?subject=english" : "/child?s=english", done: count((t) => t.startsWith("special-english-")), target: 1 },
    { key: "q", icon: "🔬", label: "素养 1 个", hint: "科学 · 编程 · 国学", href: "/child?s=quality", done: count((t) => t.startsWith("quality-")), target: 1 },
    { key: "rv", icon: "🏁", label: "周末总复习", hint: "单元测或周总复习", href: "/child/review", done: weekly, target: 1 },
  ];
  return items;
}
