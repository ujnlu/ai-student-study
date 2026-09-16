/**
 * 英语口语：
 *  - 跟读：按主题（或课本单元）由 AI 生成 8-10 句适合该年级的英文句子（SpeakingLesson 落库复用），
 *    浏览器 TTS 朗读、SpeechRecognition 听孩子跟读，按单词比对打分。
 *  - 自由对话：和橙橙用英语聊天（Conversation 落库，家长可回看）。
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveAssistant, runJson } from "@/lib/ai";
import { gradeText } from "@/lib/ai/prompts";

export { scoreSpeech, type WordDiff } from "@/lib/speaking-score";

export type SpeakItem = { en: string; zh: string; tip: string };
export type SpeakingData = { code: string; title: string; items: SpeakItem[] };

export type SpeakTopic = { code: string; band: Band; slug: string; name: string; emoji: string; desc: string; hint: string };
type Band = "g12" | "g34" | "g56";

export function bandOf(grade: number): Band {
  return grade <= 2 ? "g12" : grade <= 4 ? "g34" : "g56";
}
const BAND_TEXT: Record<Band, string> = { g12: "一二年级（英语启蒙）", g34: "三四年级", g56: "五六年级" };

type Def = [slug: string, name: string, emoji: string, desc: string, hint: string];
const TOPICS: Record<Band, Def[]> = {
  g12: [
    ["greetings", "打招呼", "👋", "Hello! I'm Dengdeng.", "打招呼与自我介绍：Hello / Hi / Good morning / I'm ... / Nice to meet you / How are you? I'm fine."],
    ["colours", "颜色", "🎨", "It's red. I like blue.", "颜色：red blue yellow green … 用 It's … / I like … / What colour is it? 句型"],
    ["numbers", "数字", "🔢", "One, two, three…", "1-10 数字：How many …? / I have three … / 数数"],
    ["animals", "动物", "🐱", "I have a cat.", "常见动物：cat dog bird fish duck … 用 I have a … / It's a … / I like … 句型"],
    ["family", "家人", "👨‍👩‍👧", "This is my mum.", "家人：mum dad grandpa grandma sister brother，This is my … / I love my …"],
    ["food", "食物", "🍎", "I like apples.", "食物水果：apple banana milk egg cake … I like … / I don't like … / Have some …"],
    ["body", "身体", "🖐️", "Touch your nose.", "身体部位：head eye ear nose mouth hand foot，Touch your … / This is my …"],
    ["classroom", "教室", "🏫", "Open your book.", "教室用语：Stand up / Sit down / Open your book / Look at the blackboard / pen pencil ruler"],
    ["weather", "天气", "☀️", "It's sunny today.", "天气：sunny rainy cloudy windy hot cold，It's … today / How's the weather?"],
    ["feelings", "心情", "😊", "I'm happy.", "心情：happy sad angry tired hungry，I'm … / Are you …?"],
  ],
  g34: [
    ["intro", "自我介绍", "🙋", "My name is… I'm 9.", "自我介绍：name, age, grade, class, hobby，My name is … / I'm … years old / I like …"],
    ["school", "学校", "🏫", "This is our library.", "学校与文具：classroom library playground teacher pen book，Where is …? It's on the … / We have …"],
    ["family", "家人与朋友", "👨‍👩‍👧", "Who's that man? He's my uncle.", "家人与朋友：Who's this? This is my … / He's tall and strong / She's my friend"],
    ["food", "吃与喝", "🍔", "Can I have some juice?", "食物饮料：Can I have some …? / I'd like … / What would you like? / Do you like …?"],
    ["animals", "动物园", "🐘", "Look at the elephant. It's so big.", "动物与形容词：big small tall short fat thin long，Look at the … It's so …"],
    ["myday", "我的一天", "⏰", "I get up at 7 o'clock.", "日常作息：get up / have breakfast / go to school / do homework / go to bed，What time is it? It's … / I … at …"],
    ["weather", "天气与季节", "🌦️", "It's warm in spring.", "天气与季节：spring summer autumn winter warm hot cool cold，Which season do you like best?"],
    ["shopping", "购物", "🛍️", "How much is it? It's 20 yuan.", "购物：How much is it? / It's … yuan / Can I try it on? / It's too big"],
    ["hobbies", "爱好", "⚽", "I like playing football.", "爱好：What's your hobby? / I like … ing / Do you like …?"],
    ["home", "我的家", "🏠", "Where are the keys? They're on the table.", "家与方位：bedroom kitchen living room，Where is / are …? It's in / on / under …"],
  ],
  g56: [
    ["intro", "自我介绍", "🙋", "Let me introduce myself.", "较完整的自我介绍：name age school hobbies favourite subject，用 3-4 句连贯表达"],
    ["routine", "日常安排", "📅", "I usually do my homework after dinner.", "一般现在时描述日常：always usually often sometimes，When do you …? I … at …"],
    ["weekend", "周末计划", "🎡", "I'm going to visit my grandparents.", "一般将来时：What are you going to do this weekend? I'm going to …"],
    ["travel", "旅行", "✈️", "I went to Beijing last summer.", "一般过去时：Where did you go? I went to … / I saw … / It was …"],
    ["food", "饮食与健康", "🥗", "We should eat more vegetables.", "健康饮食：should / shouldn't，What's your favourite food? / healthy"],
    ["festivals", "节日", "🧧", "We eat dumplings at Spring Festival.", "节日：Spring Festival / Mid-Autumn Festival / Christmas，What do you do at …?"],
    ["jobs", "职业与梦想", "👩‍🚀", "I want to be a doctor.", "职业：What do you want to be? / I want to be a … because …"],
    ["directions", "问路", "🗺️", "How can I get to the museum?", "问路指路：Excuse me, where is …? / Turn left / Go straight / next to / in front of"],
    ["health", "身体不舒服", "🤒", "I have a cold. You should see a doctor.", "看病：What's the matter? / I have a headache / You should …"],
    ["compare", "比较", "📏", "I'm taller than my brother.", "比较级：taller shorter older younger stronger，… than …"],
  ],
};

export function speakTopicsFor(grade: number): SpeakTopic[] {
  const band = bandOf(grade);
  return TOPICS[band].map(([slug, name, emoji, desc, hint]) => ({ code: `sp-${band}-${slug}`, band, slug, name, emoji, desc, hint }));
}

export function findSpeakTopic(code: string): SpeakTopic | null {
  const m = /^sp-(g12|g34|g56)-([a-z]+)$/.exec(code);
  if (!m) return null;
  const band = m[1] as Band;
  const def = TOPICS[band].find((d) => d[0] === m[2]);
  if (!def) return null;
  const [slug, name, emoji, desc, hint] = def;
  return { code, band, slug, name, emoji, desc, hint };
}

const Generated = z.object({
  title: z.string(),
  items: z
    .array(
      z.object({
        en: z.string().describe("一句英文，8 个单词以内，只用该年级学过的词"),
        zh: z.string().describe("中文意思"),
        tip: z.string().describe("发音或语调提示，一句中文，可为空"),
      }),
    )
    .min(6)
    .max(10),
});

function parseItems(json: string): SpeakItem[] {
  try {
    const arr = JSON.parse(json) as Partial<SpeakItem>[];
    return arr.filter((x) => typeof x.en === "string" && x.en.trim()).map((x) => ({ en: x.en!.trim(), zh: x.zh ?? "", tip: x.tip ?? "" }));
  } catch {
    return [];
  }
}

export async function getSpeakingLesson(code: string): Promise<SpeakingData | null> {
  const row = await db.speakingLesson.findUnique({ where: { code } });
  if (!row) return null;
  const items = parseItems(row.itemsJson);
  return items.length ? { code, title: row.title, items } : null;
}

/** 课本单元：code = ch-<chapterId>，用单元标题作主题 */
async function chapterTopic(code: string) {
  if (!code.startsWith("ch-")) return null;
  const ch = await db.textbookChapter.findUnique({ where: { id: code.slice(3) }, include: { textbook: true } });
  if (!ch) return null;
  const parent = ch.parentId ? await db.textbookChapter.findUnique({ where: { id: ch.parentId } }) : null;
  const title = parent ? `${parent.title} · ${ch.title}` : ch.title;
  return { name: title, hint: `人教 PEP 英语${gradeText(ch.textbook.grade)}${ch.textbook.semester === 1 ? "上册" : "下册"}《${title}》这一单元的核心句型和单词`, grade: ch.textbook.grade };
}

export async function getOrCreateSpeakingLesson(code: string, childId: string): Promise<SpeakingData> {
  const cached = await getSpeakingLesson(code);
  if (cached) return cached;
  const child = await db.child.findUniqueOrThrow({ where: { id: childId } });
  const t = findSpeakTopic(code);
  const ct = t ? null : await chapterTopic(code);
  if (!t && !ct) throw new Error("没有这个口语主题");
  const name = t ? t.name : ct!.name;
  const hint = t ? t.hint : ct!.hint;
  const grade = t ? child.grade : ct!.grade;
  const assistant = await resolveAssistant(child.familyId, "generate");
  const system =
    `你是中国小学英语口语老师，正在为${gradeText(grade)}（${BAND_TEXT[bandOf(grade)]}）的孩子准备一组「跟读」句子。` +
    `\n要求：\n- 8-10 句，围绕主题，从单词 / 短语到完整句子，由短到长；每句不超过 8 个单词。` +
    `\n- 只用该年级英语课本（人教 PEP）学过或常见的简单词汇，句子自然、地道、孩子日常用得上。` +
    `\n- zh 给中文意思；tip 用一句中文提示发音或语调重点（如"th 咬舌"、"句尾升调"），没有就留空。` +
    `\n- title 用中文写主题名。`;
  const r = await runJson(assistant, { system, messages: [{ role: "user", content: `主题：${name}\n主题说明：${hint}\n请生成这组跟读句子。` }] }, Generated);
  const items = r.data.items.map((x) => ({ en: x.en.trim(), zh: x.zh.trim(), tip: x.tip.trim() })).filter((x) => x.en);
  if (items.length === 0) throw new Error("生成失败，再试一次");
  const title = r.data.title.trim() || name;
  await db.speakingLesson.upsert({ where: { code }, create: { code, title, itemsJson: JSON.stringify(items) }, update: { title, itemsJson: JSON.stringify(items) } });
  return { code, title, items };
}

/** 自由对话的系统提示 */
export function chatSystemPrompt(childName: string, grade: number) {
  const band = bandOf(grade);
  const level = band === "g12" ? "只用最简单的词和 3-5 个单词的短句" : band === "g34" ? "用小学三四年级课本水平的词汇和短句" : "用小学高年级水平的词汇，句子可以稍长";
  return `You are 橙橙 (Chengcheng), a friendly orange cat who chats in English with ${childName}, a Chinese primary school student in grade ${grade}.
Rules:
- Reply in English first, ${level}. At most 2 short sentences, then ALWAYS end with one simple question to keep the chat going.
- After the English, add the Chinese meaning in parentheses on a new line, like: (中文意思)
- If the child writes Chinese, gently teach how to say it in English and ask them to try.
- If the child's English has a mistake, do not lecture; just reply naturally and include the corrected phrase, e.g. "You mean 'I have a cat'? Cool!"
- Praise effort. Keep it playful and warm. Talk only about daily life, school, hobbies, animals, food, family, weather. No adult topics.
- Never use markdown or emoji lists; plain text only.`;
}
