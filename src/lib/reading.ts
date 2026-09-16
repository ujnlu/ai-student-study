/**
 * 分级阅读（参考 RAZ / 学而思大语文分级阅读 / 大阅读 L1-L6）：
 * 每级一池 AI 生成的短文（ReadingPiece 落库复用），孩子：读一读（朗读打分）→ 答 3 题 → 星星。
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveAssistant, runJson } from "@/lib/ai";

export type ReadingQ = { q: string; options: string[]; answer: number };
export type ReadingData = { id: string; lang: "zh" | "en"; level: number; title: string; text: string; questions: ReadingQ[] };

export const READING_LEVELS: Record<number, { zh: string; en: string }> = {
  1: { zh: "60-100 字，短句，带拼音级别的常用字，儿歌 / 小故事", en: "30-50 words, very simple sentences (I see a cat.), high-frequency sight words" },
  2: { zh: "120-180 字，寓言 / 童话 / 生活小故事，有对话", en: "50-80 words, simple past/present, a short story with 2 characters" },
  3: { zh: "200-300 字，童话、科普小短文，有 1-2 个成语", en: "80-120 words, a story or a simple fact text about animals/school/family" },
  4: { zh: "300-400 字，叙事或说明文，有细节描写", en: "120-160 words, story or non-fiction, some compound sentences" },
  5: { zh: "400-500 字，名著节选风格、说明文、议论片段", en: "160-220 words, non-fiction with a clear structure, or a story with a twist" },
  6: { zh: "500-650 字，文学性较强的叙事或说理文", en: "220-300 words, articles similar to graded readers level 6, with topic sentences" },
};

const Generated = z.object({
  title: z.string(),
  text: z.string().describe("正文，段落之间用换行分隔"),
  questions: z
    .array(z.object({ q: z.string(), options: z.array(z.string()).length(4), answer: z.number().int().min(0).max(3).describe("正确选项下标 0-3") }))
    .length(3),
});

export function parsePiece(row: { id: string; lang: string; level: number; title: string; text: string; questionsJson: string }): ReadingData | null {
  try {
    const questions = JSON.parse(row.questionsJson) as ReadingQ[];
    if (!Array.isArray(questions) || questions.length === 0) return null;
    return { id: row.id, lang: row.lang === "en" ? "en" : "zh", level: row.level, title: row.title, text: row.text, questions };
  } catch {
    return null;
  }
}

/** 孩子在这一级还没读过的一篇；没有就生成一篇入池 */
export async function nextPiece(childId: string, lang: "zh" | "en", level: number): Promise<ReadingData> {
  const lv = Math.min(6, Math.max(1, level));
  const read = new Set((await db.recitation.findMany({ where: { childId, kind: "reading" }, select: { text: true } })).map((r) => r.text));
  const pool = await db.readingPiece.findMany({ where: { lang, level: lv }, orderBy: { createdAt: "asc" } });
  const unread = pool.filter((p) => !read.has(p.id));
  if (unread.length > 0) {
    const parsed = parsePiece(unread[Math.floor(Math.random() * unread.length)]);
    if (parsed) return parsed;
  }
  return generatePiece(childId, lang, lv, pool.map((p) => p.title));
}

export async function generatePiece(childId: string, lang: "zh" | "en", level: number, existingTitles: string[] = []): Promise<ReadingData> {
  const child = await db.child.findUniqueOrThrow({ where: { id: childId } });
  const assistant = await resolveAssistant(child.familyId, "generate");
  const spec = READING_LEVELS[level];
  const system =
    lang === "zh"
      ? `你是小学语文分级阅读的编者。请为分级阅读 L${level} 写一篇原创短文：${spec.zh}。内容健康有趣，适合朗读；再出 3 道四选一的阅读理解题（主要内容、细节、词语理解各一），answer 是正确选项下标。不要与这些题目重复：${existingTitles.slice(-20).join("、") || "（无）"}`
      : `You are an editor of graded readers for Chinese primary students. Write an original passage for Level ${level}: ${spec.en}. Then write 3 multiple-choice comprehension questions (4 options each, answer = index of the correct option). The title and questions must be in English; keep vocabulary at the level. Avoid these titles: ${existingTitles.slice(-20).join(", ") || "(none)"}`;
  const r = await runJson(assistant, { system, messages: [{ role: "user", content: lang === "zh" ? `请写 L${level} 的一篇短文和 3 道题。` : `Please write one Level ${level} passage with 3 questions.` }] }, Generated);
  const row = await db.readingPiece.create({ data: { lang, level, title: r.data.title.trim(), text: r.data.text.trim(), questionsJson: JSON.stringify(r.data.questions) } });
  return parsePiece(row)!;
}

/** 推荐级别：按年级（一年级 L1 …），可被孩子调整 */
export function defaultLevel(grade: number, lang: "zh" | "en") {
  return lang === "zh" ? Math.min(6, Math.max(1, grade)) : Math.min(6, Math.max(1, grade - 1));
}
