/**
 * 专题体系逻辑：目录在 topic-catalog.ts（校内专项 / 奥数 12 级 / 素养）。
 * 每个专题的「讲一讲」（课前故事 → 知识导引 → 一例一练 → 名师点拨）和题库都由 AI 生成一次后落库复用：
 *   - 讲义：TopicLecture（按 code 缓存）
 *   - 题库：Problem.topic = code, source = "bank"，difficulty 1-5；练习按"基础 / 进阶 / 挑战"三档取题（参考高思导引兴趣篇 / 拓展篇 / 超越篇）
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveAssistant, runJson } from "@/lib/ai";
import { gradeText, renderTemplate } from "@/lib/ai/prompts";
import { allTopics, ADULT_EXAMS, MODULES, type AdultSubject, type SubjectId, type Topic, type TopicSubject, type Track } from "@/lib/topic-catalog";

export { allTopics, ADULT_EXAMS, MODULES };
export type { AdultSubject, SubjectId, Topic, TopicSubject, Track };

export const SUBJECT_NAME: Record<TopicSubject, string> = { math: "数学", chinese: "语文", english: "英语", science: "科学", coding: "编程思维", culture: "国学人文", gongkao: "公务员考试", kuaiji: "初级会计", ielts: "雅思", teacher: "教师资格证", cet: "英语四六级", ai: "AI 学习", physics: "物理", chemistry: "化学", biology: "生物", history: "历史", geography: "地理", politics: "道法 / 政治" };

/** 成人考试专题用的系统提示（不套孩子的年级模板） */
export function adultSystemPrompt(subjectId: TopicSubject) {
  if (subjectId === "ai") return "你是 AI 应用与大模型方向的资深讲师，面向想系统学会用 AI 的成年人（非程序员也能懂）。讲解要结合真实工作生活场景、给可直接照做的步骤和提示词示例；涉及具体产品与参数只说公开且确定的信息，不确定就说明。";
  const exam = ADULT_EXAMS[subjectId as AdultSubject];
  return `你是${exam ? exam.name : "职业考试"}的资深培训讲师，面向备考的成年人。讲解要直击考点、给出解题套路和真题常见陷阱；出题要贴近历年真题的题型、难度与表述。`;
}
const DB_SUBJECTS = new Set<string>(["math", "chinese", "english"]);

export type Tier = "basic" | "advanced" | "challenge";
export const TIERS: Record<Tier, { name: string; stars: string; size: number; difficulty: [number, number]; blurb: string }> = {
  basic: { name: "基础篇", stars: "★", size: 6, difficulty: [1, 2], blurb: "寻找蛛丝马迹：和讲义例题一样的题" },
  advanced: { name: "进阶篇", stars: "★★", size: 6, difficulty: [3, 3], blurb: "转动数学大脑：换个情境再想想" },
  challenge: { name: "挑战篇", stars: "★★★", size: 4, difficulty: [4, 5], blurb: "探索知识巅峰：难一点的综合题" },
};
export const TOPIC_SET_SIZE = 6;
const BANK_BATCH = 12;

export function topicsFor(track: Track, subjectId: TopicSubject, grade: number) {
  const g = track === "adult" ? 0 : Math.min(12, Math.max(1, grade));
  return allTopics().filter((t) => t.track === track && t.subjectId === subjectId && t.grade === g);
}

/** 按最近成绩推荐下一档：基础 ≥80% → 进阶，进阶 ≥80% → 挑战 */
export function recommendTier(stat?: { tiers: Partial<Record<Tier, number>> } | null): Tier {
  const t = stat?.tiers ?? {};
  if ((t.basic ?? 0) < 80) return "basic";
  if ((t.advanced ?? 0) < 80) return "advanced";
  return "challenge";
}

/** 奥数：某一级的全部讲次（级 = 年级×2−1 上学期 / 年级×2 下学期） */
export function olympiadLevel(grade: number, semester: number) {
  return Math.min(12, Math.max(1, (Math.min(6, Math.max(1, grade)) - 1) * 2 + (semester === 2 ? 2 : 1)));
}
export function lecturesOfLevel(level: number) {
  return allTopics().filter((t) => t.track === "olympiad" && t.level === level).sort((a, b) => (a.no ?? 0) - (b.no ?? 0));
}

export function findTopic(code: string) {
  return allTopics().find((t) => t.code === code) ?? null;
}

export function trackName(track: Track) {
  return track === "olympiad" ? "奥数" : track === "quality" ? "素养" : track === "adult" ? "备考" : track === "gaokao" ? "高考真题" : track === "zhongkao" ? "中考真题" : "专项";
}

/** 按模块分组（保持目录顺序） */
export function groupByModule(topics: Topic[]) {
  const groups: { module: string; name: string; emoji: string; topics: Topic[] }[] = [];
  for (const t of topics) {
    let g = groups.find((x) => x.module === t.module);
    if (!g) {
      g = { module: t.module, name: MODULES[t.module]?.name ?? t.module, emoji: MODULES[t.module]?.emoji ?? "📌", topics: [] };
      groups.push(g);
    }
    g.topics.push(t);
  }
  return groups;
}

// ---------- 讲一讲（AI 生成一次后缓存） ----------

export const Lecture = z.object({
  story: z.string().optional().describe("课前故事：一个 2-3 句的生活小场景或小故事引出本讲，孩子能懂"),
  intro: z.string().describe("知识导引：这个专题是什么、生活里哪里会用到，2-3 句"),
  methods: z.array(z.string()).min(2).max(5).describe("方法口诀，每条一句"),
  examples: z
    .array(
      z.object({
        q: z.string().describe("例题"),
        steps: z.array(z.string()).min(2).max(5).describe("分步讲解，每步一句"),
        answer: z.string(),
        practice: z.object({ q: z.string().describe("与例题同类型的一道练一练"), answer: z.string() }).optional(),
      }),
    )
    .min(2)
    .max(3),
  tips: z.string().describe("名师点拨：易错点或小窍门，一两句"),
  extra: z.string().optional().describe("课堂内外：与本讲有关的数学史、生活应用或趣味小知识，2-3 句"),
});
export type Lecture = z.infer<typeof Lecture>;

/**
 * 生成共享内容（讲义 / 题库）用的上下文。讲义和题库按专题 code 全家共用，
 * 所以提示词里一律用中性身份（"同学"、专题自身的年级、不限教材版本），不带某个孩子的名字和教材，
 * 只用孩子 / 家庭来决定走哪个 AI 服务。
 */
export type GenOpts = { childId?: string; familyId?: string; model?: string | null; fast?: boolean };

async function genContext(t: Topic, opts: GenOpts) {
  let familyId = opts.familyId;
  if (!familyId && opts.childId) familyId = (await db.child.findUniqueOrThrow({ where: { id: opts.childId }, select: { familyId: true } })).familyId;
  if (!familyId) familyId = (await db.aiProvider.findFirst({ orderBy: { createdAt: "asc" }, select: { familyId: true } }))?.familyId;
  if (!familyId) throw new Error("还没有配置 AI 服务，请先到家长端 → AI 设置 添加");
  const base = await resolveAssistant(familyId, "generate");
  // fast：DeepSeek 下改用 deepseek-chat（推理模型一次 30 秒以上，批量预热太慢）
  const isDeepSeek = /deepseek/i.test(base.provider.baseUrl ?? "") || /deepseek/i.test(base.provider.defaultModel);
  const model = opts.model || (opts.fast && isDeepSeek ? "deepseek-chat" : base.model);
  const assistant = { ...base, model };
  const vars = {
    childName: "同学",
    grade: t.grade,
    gradeText: gradeText(t.grade),
    semester: t.semester === 2 ? "下学期" : t.semester === 1 ? "上学期" : "全学年",
    subject: SUBJECT_NAME[t.subjectId],
    textbook: "通用（不限教材版本）",
    region: "全国",
  };
  const system = t.track === "adult" ? adultSystemPrompt(t.subjectId) : renderTemplate(assistant.systemPrompt, vars);
  return { assistant, system };
}

function topicBrief(t: Topic) {
  if (t.track === "adult") return `考试：${SUBJECT_NAME[t.subjectId]}\n模块：${t.moduleName}\n专题：${t.name}\n专题说明：${t.hint}`;
  const where = t.track === "olympiad" ? `奥数第 ${t.level} 级第 ${t.no} 讲（${gradeText(t.grade)}${t.semester === 1 ? "上" : "下"}学期）· ${t.moduleName}模块` : `${gradeText(t.grade)}${SUBJECT_NAME[t.subjectId]} · ${t.moduleName}`;
  return `专题：${t.name}（${where}）\n专题说明：${t.hint}`;
}

export async function getLecture(code: string) {
  const row = await db.topicLecture.findUnique({ where: { code } });
  if (!row) return null;
  try {
    return JSON.parse(row.json) as Lecture;
  } catch {
    return null;
  }
}

export async function getOrCreateLecture(code: string, childId: string): Promise<Lecture> {
  return ensureLecture(code, { childId });
}

export async function ensureLecture(code: string, opts: GenOpts = {}): Promise<Lecture> {
  const cached = await getLecture(code);
  if (cached) return cached;
  const t = findTopic(code);
  if (!t) throw new Error("没有这个专题");
  const { assistant, system: base } = await genContext(t, opts);
  const who = t.track === "adult" ? "备考的成年人" : t.grade >= 7 ? `${gradeText(t.grade)}的学生` : `${gradeText(t.grade)}的孩子`;
  const system =
    base +
    `\n\n现在的任务不是出练习题，而是给${who}写一份「讲一讲」小讲义，结构固定为：` +
    `\n1. story 课前故事：2-3 句生活小场景引出本讲；` +
    `\n2. intro 知识导引：这讲学什么、哪里用得到；` +
    `\n3. methods 方法口诀：2-5 条，好记；` +
    `\n4. examples 典题精讲：2-3 道典型例题，每题分步讲解并给答案，并且"一例一练"——每道例题配一道同类型的 practice（题目 + 答案）让孩子马上试；` +
    `\n5. tips 名师点拨：易错点或小窍门；` +
    `\n6. extra 课堂内外：相关的数学史 / 背景 / 生活应用小知识，2-3 句（可选）。` +
    (t.track === "gaokao" || t.track === "zhongkao"
      ? `\n这是${t.track === "gaokao" ? "高考" : "中考"}真题专讲：story 换成这一题型的考情（分值、题量、近年趋势），methods 写解题套路与失分点，examples 用真题风格的典型题（原创，不抄真实试卷），每题标注考查的知识点。`
      : t.track === "adult"
      ? "\n这是成人考试专题：story 换成一句考情概述（分值、题量、常考形式），methods 写解题套路和秒杀技巧，examples 用真题风格例题。"
      : t.track === "olympiad"
      ? "\n这是奥数思维专题，例题要体现思维方法（画图、列表、找规律、假设），难度适合该年级学有余力的孩子，但不超出该年级能理解的范围。"
      : t.practice === "essay"
        ? "\n这是写作专题：examples 里的 q 写成'题目 + 示范片段'，steps 写成技法拆解，answer 写一句点评；practice 给孩子一个可以动笔的小题目，answer 写要点提示。"
        : "\n内容紧扣该年级要求，不超纲。");
  const r = await runJson(assistant, { system, messages: [{ role: "user", content: `${topicBrief(t)}\n\n请生成这个专题的讲义。数字和答案必须完全正确。` }] }, Lecture);
  await db.topicLecture.upsert({ where: { code }, create: { code, json: JSON.stringify(r.data) }, update: { json: JSON.stringify(r.data) } });
  return r.data;
}

// ---------- 练一练（题库按专题沉淀，三档难度） ----------

const Bank = z.object({
  problems: z.array(
    z.object({
      stem: z.string(),
      answer: z.string(),
      solution: z.string(),
      difficulty: z.number().int().min(1).max(5),
    }),
  ),
});

async function fillTopicBank(t: Topic, opts: GenOpts, need: number, tier?: Tier) {
  const { assistant, system: base } = await genContext(t, opts);
  const existing = await db.problem.findMany({ where: { topic: t.code, source: "bank" }, select: { stem: true }, take: 60 });
  const lecture = await getLecture(t.code);
  const diffText = tier
    ? `全部题目难度为 ${TIERS[tier].difficulty[0]}${TIERS[tier].difficulty[1] !== TIERS[tier].difficulty[0] ? `-${TIERS[tier].difficulty[1]}` : ""}（${TIERS[tier].name}：${TIERS[tier].blurb}）`
    : "难度分布：约一半为 1-2（基础，和讲义例题同类型），约三分之一为 3（进阶，换情境），其余为 4-5（挑战，综合）";
  const system =
    base +
    (t.track === "adult" ? "\n\n这次出的是备考练习题：贴近历年真题的题型与难度。" : t.track === "gaokao" || t.track === "zhongkao" ? `\n\n这次出的是${t.track === "gaokao" ? "高考" : "中考"}真题风格训练题：题型、难度、表述贴近真实试卷，原创不抄。` : t.grade >= 7 ? "\n\n这次出的是初高中专项练习题：紧扣课标与教材要求，题型贴近考试。" : t.track === "olympiad" ? "\n\n这次出的是奥数思维题：要有思维含量，数字和情境适合该年级。" : t.track === "quality" ? "\n\n这次出的是素养拓展题：有趣、有知识点、不超出该年级理解范围。" : "\n\n这次出的是校内专项练习题：紧扣该年级要求。") +
    `\n${diffText}。` +
    "\n题目全部用文字描述（不能依赖图片）；answer 只写最终答案（数字、字母或词语），不要写'答：'；solution 用 2-4 句讲清方法。" +
    (lecture ? `\n\n【这个专题的讲义（题目方法请与之一致）】\n方法：${lecture.methods.join("；")}\n例题：${lecture.examples.map((e) => e.q).join(" / ")}` : "");
  const r = await runJson(
    assistant,
    {
      system,
      messages: [
        {
          role: "user",
          content: `${topicBrief(t)}\n\n请出 ${need} 道题。不要与下面这些已有题目重复：\n${existing.map((e) => "- " + e.stem.slice(0, 60)).join("\n") || "（暂无）"}`,
        },
      ],
    },
    Bank,
  );
  const [lo, hi] = tier ? TIERS[tier].difficulty : [1, 5];
  const rows = [];
  for (const q of r.data.problems) {
    if (!q.stem.trim() || !q.answer.trim()) continue;
    const difficulty = tier ? Math.min(hi, Math.max(lo, q.difficulty)) : q.difficulty;
    rows.push(
      await db.problem.create({
        data: { subjectId: DB_SUBJECTS.has(t.subjectId) ? t.subjectId : null, topic: t.code, stem: q.stem.trim(), answer: q.answer.trim(), solution: q.solution, difficulty, source: "bank" },
      }),
    );
  }
  return rows;
}

/** 生成一组专题练习（某一档）：优先用孩子没做过的题库题，不够就补 */
export async function createTopicSet(childId: string, code: string, tier: Tier = "basic") {
  const t = findTopic(code);
  if (!t) throw new Error("没有这个专题");
  if (t.practice !== "quiz") throw new Error("这个专题是写一写，不出选择题");
  const cfg = TIERS[tier];
  const [lo, hi] = cfg.difficulty;
  const done = await db.attempt.findMany({ where: { childId, problem: { topic: code, source: "bank" } }, select: { problemId: true } });
  const doneIds = new Set(done.map((d) => d.problemId));
  const load = async () => (await db.problem.findMany({ where: { topic: code, source: "bank", difficulty: { gte: lo, lte: hi } } })).filter((p) => !doneIds.has(p.id));
  let pool = await load();
  if (pool.length < cfg.size) {
    const anyBank = await db.problem.count({ where: { topic: code, source: "bank" } });
    // 第一次：按分布出一整批；之后：只补这一档
    await fillTopicBank(t, { childId }, anyBank === 0 ? BANK_BATCH : Math.max(cfg.size, cfg.size - pool.length + 2), anyBank === 0 ? undefined : tier);
    pool = await load();
    if (pool.length < Math.min(3, cfg.size)) {
      await fillTopicBank(t, { childId }, cfg.size + 2, tier);
      pool = await load();
    }
  }
  pool.sort((a, b) => a.difficulty - b.difficulty || Math.random() - 0.5);
  const picked = pool.slice(0, cfg.size);
  if (picked.length === 0) throw new Error("题库为空，再试一次");
  const set = await db.practiceSet.create({
    data: { childId, kind: t.track === "olympiad" ? "olympiad" : "topic", title: `${trackName(t.track)}：${t.name} · ${cfg.name}`, status: "ready", topic: code, total: picked.length },
  });
  for (let i = 0; i < picked.length; i++) await db.practiceItem.create({ data: { setId: set.id, index: i, problemId: picked[i].id } });
  return set;
}

// ---------- 预热：提前把讲义和三档题库生成好（脚本批量跑 / 页面后台顺带跑） ----------

/** 每档题库至少备多少题（档位题量 + 2 道余量，孩子做过的不再出） */
function bankTarget(tier: Tier) {
  return TIERS[tier].size + 2;
}

/** 某专题还缺什么：讲义没有 / 哪几档题不够 */
export async function topicShortage(code: string) {
  const t = findTopic(code);
  if (!t) throw new Error("没有这个专题");
  const lecture = (await db.topicLecture.count({ where: { code } })) > 0;
  const tiers: Tier[] = [];
  if (t.practice === "quiz") {
    for (const tier of Object.keys(TIERS) as Tier[]) {
      const [lo, hi] = TIERS[tier].difficulty;
      const n = await db.problem.count({ where: { topic: code, source: "bank", difficulty: { gte: lo, lte: hi } } });
      if (n < bankTarget(tier)) tiers.push(tier);
    }
  }
  return { topic: t, lecture, tiers, ready: lecture && tiers.length === 0 };
}

/** 把一个专题预热到"点开即用"：讲义 + 三档题库；已齐的部分跳过，可重复调用 */
export async function warmTopic(code: string, opts: GenOpts = {}) {
  const s = await topicShortage(code);
  const did: string[] = [];
  if (!s.lecture) {
    await ensureLecture(code, opts);
    did.push("lecture");
  }
  for (const tier of s.tiers) {
    const [lo, hi] = TIERS[tier].difficulty;
    const have = await db.problem.count({ where: { topic: code, source: "bank", difficulty: { gte: lo, lte: hi } } });
    const rows = await fillTopicBank(s.topic, opts, Math.max(3, bankTarget(tier) - have), tier);
    did.push(`${tier}+${rows.length}`);
  }
  return did;
}

const warming = new Set<string>();
/** 页面里顺带预热（不等待、同一专题不重复起）：孩子打开某讲时把下一讲备好 */
export function warmTopicInBackground(code: string, opts: GenOpts = {}) {
  if (warming.has(code)) return;
  warming.add(code);
  warmTopic(code, { fast: true, ...opts })
    .catch((e) => console.warn(`[topic-warm] ${code}: ${e instanceof Error ? e.message : e}`))
    .finally(() => warming.delete(code));
}

export type TopicStat = { sets: number; correct: number; total: number; best: number; tiers: Partial<Record<Tier, number>> };

/** 孩子在各专题上的成绩：做过几组、正确率、各档最好成绩 */
export async function topicStats(childId: string, codes: string[]) {
  const m = new Map<string, TopicStat>();
  if (codes.length === 0) return m;
  const sets = await db.practiceSet.findMany({ where: { childId, status: "done", topic: { in: codes } }, select: { topic: true, score: true, total: true, title: true } });
  for (const s of sets) {
    const cur = m.get(s.topic!) ?? { sets: 0, correct: 0, total: 0, best: 0, tiers: {} };
    const pct = s.total ? Math.round(((s.score ?? 0) / s.total) * 100) : 0;
    cur.sets++;
    cur.correct += s.score ?? 0;
    cur.total += s.total;
    cur.best = Math.max(cur.best, pct);
    const tier: Tier = s.title.includes("挑战") ? "challenge" : s.title.includes("进阶") ? "advanced" : "basic";
    cur.tiers[tier] = Math.max(cur.tiers[tier] ?? 0, pct);
    m.set(s.topic!, cur);
  }
  return m;
}

/** 奥数某一级的进度：讲过 / 练过 / 掌握 */
export async function levelProgress(childId: string, level: number) {
  const lectures = lecturesOfLevel(level);
  const codes = lectures.map((l) => l.code);
  const [stats, lectured] = await Promise.all([topicStats(childId, codes), db.topicLecture.findMany({ where: { code: { in: codes } }, select: { code: true } })]);
  const lecturedSet = new Set(lectured.map((l) => l.code));
  const practiced = codes.filter((c) => (stats.get(c)?.sets ?? 0) > 0).length;
  const mastered = codes.filter((c) => (stats.get(c)?.best ?? 0) >= 90).length;
  return { lectures, stats, lecturedSet, practiced, mastered };
}
