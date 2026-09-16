/**
 * 把平台上支持学科（数学/语文/英语）的全部教材导入数据库，可重复运行（已 ready 的跳过）。
 *   npx tsx scripts/import-all.ts [并行数=3] [学科|all] [学段 primary|junior|senior|all]
 * 例：npx tsx scripts/import-all.ts 3                  # 全部学段全部学科
 *     npx tsx scripts/import-all.ts 2 english          # 只导英语
 *     npx tsx scripts/import-all.ts 3 all junior       # 只导初中
 */
import "dotenv/config";
import { fetchCatalog, importTextbook } from "../src/lib/textbook-import";
import { db } from "../src/lib/db";

async function main() {
  const workers = Math.max(1, Number(process.argv[2] ?? 3));
  const onlySubject = process.argv[3] && process.argv[3] !== "all" ? process.argv[3] : "";
  const onlyStage = process.argv[4] && process.argv[4] !== "all" ? process.argv[4] : "";
  const all = await fetchCatalog();
  const done = new Set((await db.textbook.findMany({ where: { status: "ready" }, select: { smarteduId: true } })).map((t) => t.smarteduId));
  const queue = all
    .filter((b) => b.subjectId && (!onlySubject || b.subjectId === onlySubject) && (!onlyStage || b.stage === onlyStage) && !done.has(b.smarteduId))
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
        await importTextbook(b.smarteduId, (m) => /改用|定位到|完成：/.test(m) && console.log(`  [w${id}] ${label}: ${m}`));
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
