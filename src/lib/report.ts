/** 家长学情报告的数据 */
import { db } from "@/lib/db";
import { activeDays, streakFrom, totalStars } from "@/lib/rewards";

export async function buildReport(childId: string) {
  const child = await db.child.findUniqueOrThrow({ where: { id: childId }, include: { textbooks: { include: { textbookVersion: true, subject: true } } } });
  const since14 = new Date(Date.now() - 14 * 86400_000);
  const since7 = new Date(Date.now() - 7 * 86400_000);

  const [attempts, masteries, mistakes, sets, uploads, days, stars] = await Promise.all([
    db.attempt.findMany({ where: { childId, createdAt: { gte: since14 } }, include: { problem: { include: { knowledgePoint: true } } }, orderBy: { createdAt: "asc" } }),
    db.mastery.findMany({ where: { childId }, include: { knowledgePoint: true } }),
    db.mistakeEntry.findMany({ where: { childId }, include: { problem: { include: { knowledgePoint: true } } } }),
    db.practiceSet.findMany({ where: { childId, status: "done", completedAt: { gte: since14 } } }),
    db.upload.findMany({ where: { childId, createdAt: { gte: since14 } }, include: { problems: { include: { attempts: { take: 1, orderBy: { createdAt: "desc" } } } } } }),
    activeDays(childId, 60),
    totalStars(childId),
  ]);

  // 每日正确率（最近 14 天）
  const byDay = new Map<string, { total: number; correct: number }>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    byDay.set(d.toISOString().slice(5, 10), { total: 0, correct: 0 });
  }
  for (const a of attempts) {
    const k = a.createdAt.toISOString().slice(5, 10);
    const row = byDay.get(k);
    if (row) {
      row.total++;
      if (a.isCorrect) row.correct++;
    }
  }
  const daily = [...byDay.entries()].map(([day, v]) => ({ day, total: v.total, rate: v.total ? Math.round((v.correct / v.total) * 100) : null }));

  // 按学科 → 单元的掌握度
  const unitMap = new Map<string, { subjectId: string; unit: string; grade: number; semester: number; scores: number[]; kps: { name: string; score: number; attempts: number }[] }>();
  for (const m of masteries) {
    const kp = m.knowledgePoint;
    const key = `${kp.subjectId}|${kp.grade}|${kp.semester}|${kp.unit}`;
    const row = unitMap.get(key) ?? { subjectId: kp.subjectId, unit: kp.unit, grade: kp.grade, semester: kp.semester, scores: [], kps: [] };
    row.scores.push(m.score);
    row.kps.push({ name: kp.name, score: m.score, attempts: m.attempts });
    unitMap.set(key, row);
  }
  const units = [...unitMap.values()]
    .map((u) => ({ ...u, avg: Math.round(u.scores.reduce((a, b) => a + b, 0) / u.scores.length) }))
    .sort((a, b) => a.subjectId.localeCompare(b.subjectId) || a.grade - b.grade || a.semester - b.semester);

  const weak = masteries
    .filter((m) => m.attempts >= 2 && m.score < 60)
    .sort((a, b) => a.score - b.score)
    .slice(0, 8)
    .map((m) => ({ name: m.knowledgePoint.name, unit: m.knowledgePoint.unit, score: m.score, attempts: m.attempts, correct: m.correct }));

  const errorTypes = new Map<string, number>();
  for (const a of attempts) if (a.isCorrect === false) errorTypes.set(a.errorType ?? "unknown", (errorTypes.get(a.errorType ?? "unknown") ?? 0) + 1);

  const week = {
    attempts: attempts.filter((a) => a.createdAt >= since7).length,
    correct: attempts.filter((a) => a.createdAt >= since7 && a.isCorrect).length,
    sets: sets.filter((s) => s.completedAt && s.completedAt >= since7).length,
    uploads: uploads.filter((u) => u.createdAt >= since7).length,
    minutes: Math.round(sets.filter((s) => s.completedAt && s.completedAt >= since7).reduce((a, s) => a + (s.durationSec ?? 0), 0) / 60),
    newMistakes: mistakes.filter((m) => m.createdAt >= since7).length,
    cleared: mistakes.filter((m) => m.clearedAt && m.clearedAt >= since7).length,
  };

  return {
    child,
    daily,
    units,
    weak,
    errorTypes: [...errorTypes.entries()].sort((a, b) => b[1] - a[1]),
    week,
    mistakesOpen: mistakes.filter((m) => m.status !== "cleared").length,
    streak: streakFrom(days),
    activeDays: days.size,
    stars,
  };
}

export type Report = Awaited<ReturnType<typeof buildReport>>;

export function reportToText(r: Report) {
  const err: Record<string, string> = { concept: "概念不清", calculation: "计算错误", reading: "审题错误", careless: "粗心", unknown: "未分类" };
  return [
    `孩子：${r.child.name}，${r.child.grade}年级${r.child.semester === 1 ? "上" : "下"}学期`,
    `最近 7 天：作答 ${r.week.attempts} 题，正确 ${r.week.correct} 题；完成练习 ${r.week.sets} 组，拍作业 ${r.week.uploads} 次，练习用时约 ${r.week.minutes} 分钟；新增错题 ${r.week.newMistakes} 道，消灭 ${r.week.cleared} 道；连续学习 ${r.streak} 天。`,
    `未消灭错题：${r.mistakesOpen} 道。`,
    `错因分布：${r.errorTypes.map(([k, v]) => `${err[k] ?? k} ${v}`).join("，") || "无"}`,
    `薄弱知识点：${r.weak.map((w) => `${w.name}（掌握度 ${w.score}，${w.correct}/${w.attempts}）`).join("；") || "暂无"}`,
    `各单元掌握度：${r.units.map((u) => `${u.unit} ${u.avg}`).join("；") || "暂无"}`,
    `最近 14 天每日正确率：${r.daily.filter((d) => d.rate !== null).map((d) => `${d.day} ${d.rate}%`).join("，") || "无"}`,
  ].join("\n");
}
