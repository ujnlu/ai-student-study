/**
 * 背诵：从课文原文提取要背的古诗 / 段落（内存缓存），并按字比对孩子背出来的内容。
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveAssistant, runJson } from "@/lib/ai";
import { gradeText, renderTemplate } from "@/lib/ai/prompts";
import { chapterPath } from "@/lib/sync";
import { chapterText } from "@/lib/dictation";

export type RecitePiece = { title: string; author: string; text: string; kind: "poem" | "passage" };
export type ReciteData = { chapterId: string; title: string; pieces: RecitePiece[] };
export type DiffChar = { ch: string; ok: boolean };

const Extracted = z.object({
  pieces: z.array(
    z.object({
      title: z.string().describe("题目，古诗写诗名，课文写课文题目"),
      author: z.string().describe("作者，古诗写朝代和作者如\"唐 李白\"，课文没有就留空"),
      kind: z.enum(["poem", "passage"]),
      text: z.string().describe("要背诵的原文，保留标点；古诗每句一行；课文段落之间用换行分隔"),
    }),
  ),
});

// 内存缓存（开发环境热更新也不丢）
const g = globalThis as unknown as { __reciteCache?: Map<string, ReciteData> };
const cache = (g.__reciteCache ??= new Map<string, ReciteData>());

export function getCachedReciteText(chapterId: string) {
  return cache.get(chapterId) ?? null;
}

/** 只保留汉字 / 字母 / 数字，用来比对 */
export function normalize(s: string) {
  return Array.from(s.toLowerCase()).filter((c) => /[一-龥a-z0-9]/.test(c));
}

/** 课文没有明确背诵要求时的兜底：正文前 ~150 字 */
function fallbackPassage(title: string, text: string): RecitePiece {
  const body = text
    .split("\n")
    .filter((l) => l.replace(/[^一-龥]/g, "").length >= 6 && !/^(第[一-九十]+单元|语文园地|读一读|写一写|想一想|朗读课文|背诵课文)/.test(l))
    .join("")
    .replace(/\s+/g, "");
  let cut = body.slice(0, 150);
  const lastStop = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("！"), cut.lastIndexOf("？"));
  if (lastStop > 60) cut = cut.slice(0, lastStop + 1);
  return { title, author: "", kind: "passage", text: cut };
}

export async function extractReciteText(chapterId: string, familyId: string): Promise<ReciteData> {
  const hit = cache.get(chapterId);
  if (hit) return hit;

  const chapter = await db.textbookChapter.findUnique({ where: { id: chapterId }, include: { textbook: true } });
  if (!chapter) throw new Error("找不到这一课");
  const text = await chapterText(chapter);
  if (text.replace(/[^一-龥]/g, "").length < 20) {
    throw new Error("这一课的课文还没有文字内容，暂时不能背诵。可以先换一课试试～");
  }

  const assistant = await resolveAssistant(familyId, "generate");
  const path = await chapterPath(chapterId);
  const system =
    renderTemplate(assistant.systemPrompt, {
      childName: "孩子",
      grade: chapter.textbook.grade,
      gradeText: gradeText(chapter.textbook.grade),
      semester: chapter.textbook.semester === 1 ? "上学期" : "下学期",
      subject: "语文",
      textbook: chapter.textbook.title,
      region: "",
    }) +
    `\n\n【本次任务】从课文原文里找出要背诵的内容，原样抄录（一个字都不要改、不要补、不要漏，去掉夹杂的拼音、页码、注释序号）：\n` +
    `- 如果这一课是古诗（一首或多首），每首诗单独一条：title 诗名、author 朝代和作者、kind=poem、text 是整首诗，每句一行。\n` +
    `- 如果是课文，看课后题有没有"背诵课文""背诵第 x 自然段"之类的要求：有就抄录要求背的那些段落，kind=passage，title 是课文题目；\n` +
    `  没有明确要求就选课文开头最适合背诵的 1-2 个自然段（约 80-150 字）。\n` +
    `- 不要把课后练习、生字表、"读一读"等非正文内容当成背诵内容。`;

  let pieces: RecitePiece[] = [];
  try {
    const r = await runJson(assistant, { system, messages: [{ role: "user", content: `课时：${path}\n\n课文原文：\n${text.slice(0, 4500)}` }] }, Extracted);
    pieces = r.data.pieces
      .map((p) => ({ title: p.title.trim() || chapter.title, author: p.author.trim(), kind: p.kind, text: p.text.replace(/[ \t]+/g, "").replace(/\n{2,}/g, "\n").trim() }))
      .filter((p) => normalize(p.text).length >= 8)
      .slice(0, 4);
  } catch (e) {
    console.warn("[recite] AI 提取失败，使用兜底段落", e instanceof Error ? e.message : e);
  }
  if (pieces.length === 0) pieces = [fallbackPassage(chapter.title, text)];

  const data: ReciteData = { chapterId, title: chapter.title, pieces };
  cache.set(chapterId, data);
  return data;
}

/**
 * 按字比对：去掉标点空格后做最长公共子序列，
 * accuracy = 匹配上的字数 / 原文字数；diff 按原文（含标点）逐字标记，标点一律 ok。
 */
export function scoreRecitation(expected: string, transcript: string): { accuracy: number; diff: DiffChar[]; matched: number; total: number } {
  const a = normalize(expected);
  const b = normalize(transcript);
  const n = a.length;
  const m = b.length;
  if (n === 0) return { accuracy: 0, diff: [], matched: 0, total: 0 };

  // LCS 表（n、m 都是几百以内，直接二维）
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // 回溯，标记原文里哪些字被背出来了
  const okFlags = new Array<boolean>(n).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      okFlags[i] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const matched = okFlags.filter(Boolean).length;

  const diff: DiffChar[] = [];
  let k = 0;
  for (const ch of Array.from(expected)) {
    if (/[一-龥a-zA-Z0-9]/.test(ch)) {
      diff.push({ ch, ok: okFlags[k] ?? false });
      k++;
    } else diff.push({ ch, ok: true });
  }
  return { accuracy: Math.round((matched / n) * 100), diff, matched, total: n };
}
