/**
 * 家长自学：每个家庭一个隐藏的"学习者"（Child.kind = adult），复用练习 / 错题 / 复习整套机制。
 */
import { db } from "@/lib/db";

export async function getOrCreateAdultLearner(familyId: string) {
  const existing = await db.child.findFirst({ where: { familyId, kind: "adult" } });
  if (existing) return existing;
  return db.child.create({ data: { familyId, name: "家长", avatar: "🧑‍💼", grade: 0, kind: "adult" } });
}
