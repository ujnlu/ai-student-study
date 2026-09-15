/**
 * 加固复习：
 * - 薄弱巩固练（consolidate）：挑掌握度低的知识点，从对应课时的题库里出题。
 * - 周末总复习（weekly）：最近 7 天练过的课 + 当前课和它前面两课，混合出一份限时小卷。
 * 题目都来自 bank 题库（与同步练、单元测共用）；不够时用 fillLessonBank 补题（每次最多 2 次 AI 调用）。
 */
import { db } from "@/lib/db";
import { chapterPath, currentChapter, lessonChapters } from "@/lib/sync";
import { fillLessonBank } from "@/lib/unit-test";

export const WEAK_SCORE = 70;
export const CONSOLIDATE_SIZE = 8;
export const WEEKLY_SIZE = 12;
export const WEEKLY_SECONDS = 15 * 60;
const MAX_WEAK_KPS = 4;
const MAX_FILL = 2;
const FILL_PER_LESSON = 8;
const RECENT_DAYS = 7;

type BankProblem = { id: string; chapterId: string | null; knowledgePointId: string | null; difficulty: number };

/** 孩子在某学科掌握度偏弱的知识点（做过至少一次、分数 < 70），按分数从低到高 */
async function weakMasteries(childId: string, subjectId: string, take = MAX_WEAK_KPS) {
  return db.mastery.findMany({
    where: { childId, score: { lt: WEAK_SCORE }, attempts: { gte: 1 }, knowledgePoint: { subjectId } },
    include: { knowledgePoint: true },
    orderBy: [{ score: "asc" }, { updatedAt: "desc" }],
    take,
  });
}

/** 孩子没做过的题库题（按章节或知识点） */
async function unattemptedBank(childId: string, where: { chapterIds?: string[]; knowledgePointIds?: string[] }): Promise<BankProblem[]> {
  const or: { chapterId?: { in: string[] }; knowledgePointId?: { in: string[] } }[] = [];
  if (where.chapterIds?.length) or.push({ chapterId: { in: where.chapterIds } });
  if (where.knowledgePointIds?.length) or.push({ knowledgePointId: { in: where.knowledgePointIds } });
  if (or.length === 0) return [];
  const pool = await db.problem.findMany({
    where: { source: "bank", OR: or },
    select: { id: true, chapterId: true, knowledgePointId: true, difficulty: true },
  });
  if (pool.length === 0) return [];
  const done = await db.attempt.findMany({ where: { childId, problemId: { in: pool.map((p) => p.id) } }, select: { problemId: true } });
  const doneIds = new Set(done.map((d) => d.problemId));
  return pool.filter((p) => !doneIds.has(p.id));
}

/** 各组轮流取题（组内已按易到难），最后整体再按难度排一次，保持从易到难 */
function roundRobin(groups: BankProblem[][], size: number) {
  const gs = groups.map((g) => [...g].sort((a, b) => a.difficulty - b.difficulty || Math.random() - 0.5)).filter((g) => g.length > 0);
  const picked: BankProblem[] = [];
  const seen = new Set<string>();
  for (let round = 0; picked.length < size; round++) {
    let any = false;
    for (const g of gs) {
      if (picked.length >= size) break;
      const p = g[round];
      if (!p) continue;
      any = true;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      picked.push(p);
    }
    if (!any) break;
  }
  const order = new Map(picked.map((p, i) => [p.id, i]));
  picked.sort((a, b) => a.difficulty - b.difficulty || order.get(a.id)! - order.get(b.id)!);
  return picked;
}

async function createSetWithItems(data: { childId: string; kind: string; title: string; chapterId?: string | null; knowledgePointId?: string | null; timeLimitSec?: number | null }, picked: BankProblem[]) {
  const set = await db.practiceSet.create({
    data: {
      childId: data.childId,
      kind: data.kind,
      title: data.title,
      status: "ready",
      chapterId: data.chapterId ?? null,
      knowledgePointId: data.knowledgePointId ?? null,
      timeLimitSec: data.timeLimitSec ?? null,
      total: picked.length,
    },
  });
  for (let i = 0; i < picked.length; i++) await db.practiceItem.create({ data: { setId: set.id, index: i, problemId: picked[i].id } });
  return set;
}

/** 当前课的题库题；不够就补一次 */
async function currentLessonPool(childId: string, subjectId: string, size: number) {
  const chapter = await currentChapter(childId, subjectId);
  if (!chapter) throw new Error("还没有导入这个学科的教材，请先在家长端「教材」页导入");
  let pool = await unattemptedBank(childId, { chapterIds: [chapter.id] });
  if (pool.length < size) {
    await fillLessonBank(childId, chapter.id, Math.max(FILL_PER_LESSON, size - pool.length));
    pool = await unattemptedBank(childId, { chapterIds: [chapter.id] });
  }
  return { chapter, pool };
}

/** 薄弱巩固练：围绕掌握度最低的几个知识点出一组题 */
export async function createConsolidateSet(childId: string, subjectId = "math", size = CONSOLIDATE_SIZE) {
  const weak = await weakMasteries(childId, subjectId);

  if (weak.length === 0) {
    const { chapter, pool } = await currentLessonPool(childId, subjectId, size);
    const picked = roundRobin([pool], size);
    if (picked.length === 0) throw new Error("题库为空");
    return createSetWithItems({ childId, kind: "consolidate", title: `巩固练：${chapter.title}`, chapterId: chapter.id }, picked);
  }

  let fills = 0;
  const groups: { name: string; kpId: string; problems: BankProblem[] }[] = [];
  for (const m of weak) {
    const kp = m.knowledgePoint;
    const query = { chapterIds: kp.chapterId ? [kp.chapterId] : [], knowledgePointIds: [kp.id] };
    let pool = await unattemptedBank(childId, query);
    if (pool.length < 2 && kp.chapterId && fills < MAX_FILL) {
      fills++;
      await fillLessonBank(childId, kp.chapterId, FILL_PER_LESSON).catch(() => null);
      pool = await unattemptedBank(childId, query);
    }
    groups.push({ name: kp.name, kpId: kp.id, problems: pool });
  }

  const picked = roundRobin(groups.map((g) => g.problems), size);
  if (picked.length === 0) {
    // 薄弱知识点都没有可用的题：退回当前课
    const { chapter, pool } = await currentLessonPool(childId, subjectId, size);
    const fallback = roundRobin([pool], size);
    if (fallback.length === 0) throw new Error("题库为空");
    return createSetWithItems({ childId, kind: "consolidate", title: `巩固练：${chapter.title}`, chapterId: chapter.id }, fallback);
  }
  const pickedIds = new Set(picked.map((p) => p.id));
  const used = groups.filter((g) => g.problems.some((p) => pickedIds.has(p.id)));
  const names = (used.length ? used : groups).map((g) => g.name);
  return createSetWithItems(
    { childId, kind: "consolidate", title: `巩固练：${names.join("、")}`, knowledgePointId: used[0]?.kpId ?? weak[0].knowledgePointId, chapterId: weak[0].knowledgePoint.chapterId },
    picked,
  );
}

type Lesson = { id: string; title: string; sortOrder: number; textbookId: string };

/** 周末总复习要覆盖的课：最近 7 天做过题的课 + 当前课 + 当前课前两课 */
async function weeklyLessons(childId: string, subjectId: string): Promise<{ current: Lesson | null; lessons: Lesson[] }> {
  const since = new Date(Date.now() - RECENT_DAYS * 86400_000);
  const recent = await db.attempt.findMany({
    where: { childId, createdAt: { gte: since }, problem: { chapterId: { not: null }, chapter: { textbook: { subjectId } } } },
    select: { problem: { select: { chapterId: true } } },
  });
  const ids = new Set(recent.map((a) => a.problem.chapterId!).filter(Boolean));

  const cur = await currentChapter(childId, subjectId);
  let current: Lesson | null = null;
  if (cur) {
    current = { id: cur.id, title: cur.title, sortOrder: cur.sortOrder, textbookId: cur.textbook.id };
    ids.add(cur.id);
    const all = await db.textbookChapter.findMany({ where: { textbookId: cur.textbook.id }, orderBy: { sortOrder: "asc" } });
    const lessons = lessonChapters(all);
    const idx = lessons.findIndex((l) => l.id === cur.id);
    if (idx > 0) for (const l of lessons.slice(Math.max(0, idx - 2), idx)) ids.add(l.id);
  }
  if (ids.size === 0) return { current, lessons: [] };
  const rows = await db.textbookChapter.findMany({ where: { id: { in: [...ids] } }, orderBy: [{ textbookId: "asc" }, { sortOrder: "asc" }] });
  return { current, lessons: rows.map((r) => ({ id: r.id, title: r.title, sortOrder: r.sortOrder, textbookId: r.textbookId })) };
}

/** 标题里的范围：同一单元就写单元名，否则写"第一课～最后一课" */
async function rangeLabel(lessons: Lesson[]) {
  if (lessons.length === 0) return "";
  if (lessons.length === 1) return lessons[0].title;
  const units = new Set<string>();
  for (const l of lessons) units.add((await chapterPath(l.id)).split(" › ")[0]);
  if (units.size === 1) return [...units][0];
  return `${lessons[0].title}～${lessons[lessons.length - 1].title}`;
}

/** 周末总复习：多课混合、限时 15 分钟 */
export async function createWeeklyReviewSet(childId: string, subjectId = "math", size = WEEKLY_SIZE) {
  const { current, lessons } = await weeklyLessons(childId, subjectId);
  if (lessons.length === 0) throw new Error("还没有导入这个学科的教材，请先在家长端「教材」页导入");
  const lessonIds = lessons.map((l) => l.id);

  let pool = await unattemptedBank(childId, { chapterIds: lessonIds });
  if (pool.length < size) {
    // 题最少的课优先补题，最多补两课
    const counts = new Map(lessonIds.map((id) => [id, 0]));
    for (const p of pool) if (p.chapterId) counts.set(p.chapterId, (counts.get(p.chapterId) ?? 0) + 1);
    const fewest = [...lessons].sort((a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0)).slice(0, MAX_FILL);
    for (const l of fewest) {
      await fillLessonBank(childId, l.id, FILL_PER_LESSON).catch(() => null);
      pool = await unattemptedBank(childId, { chapterIds: lessonIds });
      if (pool.length >= size) break;
    }
  }
  if (pool.length === 0) throw new Error("题库为空");

  const picked = roundRobin(
    lessonIds.map((id) => pool.filter((p) => p.chapterId === id)),
    size,
  );
  const pickedChapters = new Set(picked.map((p) => p.chapterId));
  const covered = lessons.filter((l) => pickedChapters.has(l.id));
  const label = await rangeLabel(covered.length ? covered : lessons);
  return createSetWithItems(
    { childId, kind: "weekly", title: `周末总复习：${label}`, chapterId: current?.id ?? null, timeLimitSec: WEEKLY_SECONDS },
    picked,
  );
}

/** 介绍页用：薄弱知识点 + 最近学的课 */
export async function consolidateInfo(childId: string, subjectId = "math") {
  const [weak, { lessons }] = await Promise.all([
    weakMasteries(childId, subjectId),
    weeklyLessons(childId, subjectId).catch(() => ({ current: null, lessons: [] as Lesson[] })),
  ]);
  return {
    weakKps: weak.map((m) => ({ name: m.knowledgePoint.name, score: m.score })),
    recentLessons: lessons.map((l) => l.title),
  };
}
