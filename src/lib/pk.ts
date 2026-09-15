/**
 * 口算 PK：孩子和吉祥物「橙橙」比赛做口算。
 * 题目程序生成（同口算天天练），不限时；对手按年级固定节奏答题。
 */
import { db } from "@/lib/db";
import { generateOral } from "@/lib/oral";

export const PK_WIN_STARS = 10;

/** 橙橙每题用时（秒）：年级越高越快 */
export function opponentSpeedSec(grade: number) {
  if (grade <= 1) return 7;
  if (grade === 2) return 6;
  if (grade === 3) return 5;
  return 4.5;
}

/** 创建一局 PK（kind = "pk"，不限时） */
export async function createPkSet(childId: string, count = 10) {
  const child = await db.child.findUniqueOrThrow({ where: { id: childId } });
  const items = generateOral(child.grade, child.semester, count);
  const set = await db.practiceSet.create({
    data: { childId, kind: "pk", title: "口算 PK", status: "ready", total: items.length, timeLimitSec: null },
  });
  for (let i = 0; i < items.length; i++) {
    const p = await db.problem.create({
      data: { subjectId: "math", stem: items[i].stem, answer: items[i].answer, solution: items[i].tag, difficulty: 1, source: "generated" },
    });
    await db.practiceItem.create({ data: { setId: set.id, index: i, problemId: p.id } });
  }
  return set;
}

export function pkWinReason(setId: string) {
  return `PK 获胜 ${setId}`;
}
