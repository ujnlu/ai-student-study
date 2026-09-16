/**
 * 听写：从课文原文提取本课的生字 / 词语，按章节缓存到 WordList。
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveAssistant, runJson } from "@/lib/ai";
import { gradeText, renderTemplate } from "@/lib/ai/prompts";
import { chapterPath } from "@/lib/sync";

export type DictWord = { word: string; pinyin: string; hint: string };
export type WordListData = { id: string; chapterId: string; subjectId: string; title: string; words: DictWord[] };

import { SUBJECT_NAME } from "@/lib/subjects";
const MAX_EXCERPT = 4500;

const Extracted = z.object({
  words: z.array(
    z.object({
      word: z.string().describe("要听写的生字或词语，只写汉字（英语则只写单词）"),
      pinyin: z.string().describe("带声调的拼音，如 kē dǒu；英语写音标或留空"),
      hint: z.string().describe("一句包含这个词的短句，把这个词换成 ____，如：池塘里有一群小____。"),
    }),
  ),
});

export function parseWords(json: string): DictWord[] {
  try {
    const arr = JSON.parse(json) as Partial<DictWord>[];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((w) => ({ word: String(w.word ?? "").trim(), pinyin: String(w.pinyin ?? "").trim(), hint: String(w.hint ?? "").trim() }))
      .filter((w) => w.word);
  } catch {
    return [];
  }
}

/** 课文页面文字：去掉纯拼音 / 纯数字的行（导入的拼音行编码混乱，只会浪费 token） */
export async function chapterText(chapter: { textbookId: string; pageStart: number | null; pageEnd: number | null }) {
  if (!chapter.pageStart) return "";
  const pages = await db.textbookPage.findMany({
    where: { textbookId: chapter.textbookId, pageNo: { gte: chapter.pageStart, lte: chapter.pageEnd ?? chapter.pageStart } },
    orderBy: { pageNo: "asc" },
  });
  return pages
    .map((p) => p.text)
    .join("\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /[一-龥]/.test(l))
    .join("\n");
}

/** 已缓存的词表（不触发 AI） */
export async function getWordList(chapterId: string): Promise<WordListData | null> {
  const wl = await db.wordList.findUnique({ where: { chapterId } });
  if (!wl) return null;
  return { id: wl.id, chapterId: wl.chapterId, subjectId: wl.subjectId, title: wl.title, words: parseWords(wl.wordsJson) };
}

/** 取或生成某一课的听写词表 */
export async function getOrCreateWordList(chapterId: string, familyId: string): Promise<WordListData> {
  const cached = await getWordList(chapterId);
  if (cached && cached.words.length > 0) return cached;

  const chapter = await db.textbookChapter.findUnique({ where: { id: chapterId }, include: { textbook: true } });
  if (!chapter) throw new Error("找不到这一课");
  const text = await chapterText(chapter);
  if (text.replace(/[^一-龥]/g, "").length < 20) {
    throw new Error("这一课的课文还没有文字内容，暂时不能听写。可以先换一课试试～");
  }

  const subjectId = chapter.textbook.subjectId;
  const subjectName = SUBJECT_NAME[subjectId] ?? "语文";
  const assistant = await resolveAssistant(familyId, "generate");
  const path = await chapterPath(chapterId);
  const system =
    renderTemplate(assistant.systemPrompt, {
      childName: "孩子",
      grade: chapter.textbook.grade,
      gradeText: gradeText(chapter.textbook.grade),
      semester: chapter.textbook.semester === 1 ? "上学期" : "下学期",
      subject: subjectName,
      textbook: chapter.textbook.title,
      region: "",
    }) +
    `\n\n【本次任务】从课文原文整理"听写词表"。` +
    (subjectId === "english"
      ? `列出这一课要求掌握的单词和短语（10-20 个），word 只写英文，pinyin 留空，hint 用一句简单英文把该词换成 ____。`
      : `优先使用课文后面的生字表 / 词语表（教材里通常是一行行单独的汉字、或"读一读，记一记"里的词语），组成 10-20 个适合${gradeText(chapter.textbook.grade)}听写的词语：` +
        `把单个生字组成课文里出现过的两字词（如"蝌"→"蝌蚪"，"袋"→"脑袋"），词语表里的词直接用。` +
        `不要超出课文范围，不要重复，不要用整句。pinyin 写带声调的拼音，hint 用课文里的原句或简单短句，把该词换成 ____。`);

  const r = await runJson(
    assistant,
    {
      system,
      messages: [{ role: "user", content: `课时：${path}\n\n课文原文：\n${text.slice(0, MAX_EXCERPT)}` }],
    },
    Extracted,
  );
  const seen = new Set<string>();
  const words = r.data.words
    .map((w) => ({ word: w.word.replace(/[\s，。、！？“”]/g, ""), pinyin: w.pinyin.trim(), hint: w.hint.trim() }))
    .filter((w) => w.word && !seen.has(w.word) && seen.add(w.word))
    .slice(0, 20);
  if (words.length === 0) throw new Error("没能从这一课里找出要听写的词语，再试一次吧");

  const title = chapter.title;
  const wl = await db.wordList.upsert({
    where: { chapterId },
    create: { chapterId, subjectId, title, wordsJson: JSON.stringify(words) },
    update: { title, wordsJson: JSON.stringify(words) },
  });
  return { id: wl.id, chapterId, subjectId, title, words };
}
