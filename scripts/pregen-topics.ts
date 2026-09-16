/**
 * 预热专题内容：提前把每个专题的「讲一讲」讲义和三档题库生成好，孩子点开即用（不用等 30 秒）。
 * 讲义 / 题库按专题 code 全家共用，已生成的跳过，可中断后重跑（续传）。
 *
 *   npx tsx scripts/pregen-topics.ts [选项]
 *     --track special,olympiad,quality,adult,gaokao,zhongkao   只跑这些赛道（默认全部）
 *     --subject math,chinese          只跑这些学科
 *     --grade 2,3                     只跑这些年级（奥数按讲次年级）
 *     --level 3                       只跑奥数某一级
 *     --code xxx,yyy                  只跑指定专题
 *     --children-first                家里孩子当前年级（及对应奥数级）的专题排在最前（默认开）
 *     --no-children-first             按目录顺序
 *     --concurrency 4                 并行数（默认 3）
 *     --model deepseek-chat           指定模型；默认 DeepSeek 下自动用 deepseek-chat（推理模型一次 30 秒以上）
 *     --slow                          不切换，用家长端配置的助手模型（质量更稳但很慢）
 *     --dry                           只列出要跑的专题，不调用 AI
 * 例：npx tsx scripts/pregen-topics.ts --grade 2 --concurrency 4
 *     nohup npx tsx scripts/pregen-topics.ts > pregen.log 2>&1 &
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { allTopics, olympiadLevel, topicShortage, warmTopic, type Topic } from "../src/lib/topics";

function opt(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const list = (name: string) => opt(name)?.split(",").map((s) => s.trim()).filter(Boolean);

async function main() {
  const tracks = list("track");
  const subjects = list("subject");
  const grades = list("grade")?.map(Number);
  const level = opt("level") ? Number(opt("level")) : undefined;
  const codes = list("code");
  const concurrency = Math.max(1, Number(opt("concurrency") ?? 3));
  const model = opt("model") ?? null;
  const fast = !flag("slow");
  const dry = flag("dry");
  const childrenFirst = !flag("no-children-first");

  let topics = allTopics().filter(
    (t) =>
      (!tracks || tracks.includes(t.track)) &&
      (!subjects || subjects.includes(t.subjectId)) &&
      (!grades || grades.includes(t.grade)) &&
      (level === undefined || t.level === level) &&
      (!codes || codes.includes(t.code)),
  );

  if (childrenFirst) {
    const kids = await db.child.findMany({ where: { kind: "child" }, select: { grade: true, semester: true } });
    const hot = new Set<string>();
    for (const k of kids) {
      const lv = olympiadLevel(k.grade, k.semester);
      for (const t of topics) if ((t.track !== "olympiad" && t.track !== "adult" && t.grade === k.grade) || (t.track === "olympiad" && t.level === lv)) hot.add(t.code);
    }
    const rank = (t: Topic) => (hot.has(t.code) ? 0 : 1);
    topics = topics.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i).map((x) => x.t);
    console.log(`孩子当前年级相关专题 ${hot.size} 个，排在最前`);
  }

  // 先查缺：已齐的直接跳过
  const todo: { topic: Topic; need: string }[] = [];
  for (const t of topics) {
    const s = await topicShortage(t.code);
    if (s.ready) continue;
    todo.push({ topic: t, need: [!s.lecture ? "讲义" : "", ...s.tiers].filter(Boolean).join("/") });
  }
  console.log(`共 ${topics.length} 个专题，已齐 ${topics.length - todo.length}，待生成 ${todo.length}${dry ? "（dry-run）" : ""}，并行 ${concurrency}${model ? `，模型 ${model}` : fast ? "，快速模型" : "，配置的模型"}`);
  if (dry) {
    for (const x of todo) console.log(`  ${x.topic.code}  ${x.topic.name}  缺 ${x.need}`);
    return;
  }

  let done = 0;
  let failed = 0;
  const t0 = Date.now();
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const { topic, need } = todo[next++];
      let ok = false;
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        const t1 = Date.now();
        try {
          const did = await warmTopic(topic.code, { model, fast });
          ok = true;
          done++;
          console.log(`[${done + failed}/${todo.length}] ✓ ${topic.code} ${topic.name}（${did.join(" ")}，${Math.round((Date.now() - t1) / 1000)}s）`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (attempt < 3) {
            console.warn(`  ↻ ${topic.code} 第 ${attempt} 次失败：${msg.slice(0, 120)}，${attempt * 20}s 后重试`);
            await new Promise((r) => setTimeout(r, attempt * 20000));
          } else {
            failed++;
            console.error(`[${done + failed}/${todo.length}] ✗ ${topic.code} ${topic.name}（缺 ${need}）：${msg.slice(0, 200)}`);
          }
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  console.log(`完成：成功 ${done}，失败 ${failed}，用时 ${Math.round((Date.now() - t0) / 60000)} 分钟`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
