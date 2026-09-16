/**
 * 把平台上支持学科（数学/语文/英语）的全部教材导入数据库，可重复运行（已 ready 的跳过）。
 *   npx tsx scripts/import-all.ts [并行数=3] [学科|all] [学段 primary|junior|senior|all] [--missing] [--images]
 * 例：npx tsx scripts/import-all.ts 3                  # 全部学段全部学科
 *     npx tsx scripts/import-all.ts 2 english          # 只导英语
 *     npx tsx scripts/import-all.ts 3 all junior       # 只导初中
 *     npx tsx scripts/import-all.ts 2 all all --missing          # 只重导"仅章节"（PDF 需登录、没拿到正文）的书，配置平台凭据后用
 *     npx tsx scripts/import-all.ts 2 all all --missing --images # 同上，但拿不到 PDF 时下载页面图片（初高中默认不存图片）
 */
import "dotenv/config";
import { fetchCatalog, importTextbook } from "../src/lib/textbook-import";
import { db } from "../src/lib/db";

async function main() {
  const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const workers = Math.max(1, Number(args[0] ?? 3));
  const onlySubject = args[1] && args[1] !== "all" ? args[1] : "";
  const onlyStage = args[2] && args[2] !== "all" ? args[2] : "";
  const missingOnly = flags.has("--missing");
  const withImages = flags.has("--images");
  const all = await fetchCatalog();
  // --missing：只重导"仅章节"的书（contentSource=none）；否则跳过所有已 ready 的
  const ready = await db.textbook.findMany({ where: { status: "ready" }, select: { smarteduId: true, contentSource: true } });
  const done = new Set(ready.filter((t) => (missingOnly ? t.contentSource !== "none" : true)).map((t) => t.smarteduId));
  const missing = new Set(ready.filter((t) => t.contentSource === "none").map((t) => t.smarteduId));
  const queue = all
    .filter((b) => b.subjectId && (!onlySubject || b.subjectId === onlySubject) && (!onlyStage || b.stage === onlyStage) && !done.has(b.smarteduId) && (!missingOnly || missing.has(b.smarteduId)))
    .sort((a, b) => a.subjectId!.localeCompare(b.subjectId!) || a.versionName.localeCompare(b.versionName) || a.grade - b.grade || a.semester - b.semester);
  console.log(`待导入 ${queue.length} 本（已跳过 ${done.size} 本），${workers} 路并行`);
  let ok = 0;
  let fail = 0;
  const t0 = Date.now();
  const run = async (id: number) => {
    for (;;) {
      const b = queue.shift();
      if (!b) return;
      const label = `${b.subjectId} ${b.versionName} ${b.grade}${b.semester === 1 ? "上" : "下"}`;
      const t1 = Date.now();
      try {
        await importTextbook(b.smarteduId, (m) => /改用|定位到|完成：|不可下载/.test(m) && console.log(`  [w${id}] ${label}: ${m}`), withImages ? { images: true } : {});
        ok++;
        console.log(`✓ [w${id}] ${label} ${b.title} (${Math.round((Date.now() - t1) / 1000)}s)  进度 ${ok + fail}/${ok + fail + queue.length}，已用 ${Math.round((Date.now() - t0) / 60000)} 分钟`);
      } catch (e) {
        fail++;
        console.log(`✗ [w${id}] ${label} ${b.title}: ${e instanceof Error ? e.message : e}`);
      }
    }
  };
  await Promise.all(Array.from({ length: workers }, (_, i) => run(i + 1)));
  console.log(`全部结束：成功 ${ok}，失败 ${fail}，用时 ${Math.round((Date.now() - t0) / 60000)} 分钟`);
}

main().finally(() => db.$disconnect());
