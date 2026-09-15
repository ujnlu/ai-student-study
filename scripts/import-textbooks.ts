/**
 * 批量导入教材：npx tsx scripts/import-textbooks.ts <学科> <版本名> [年级]
 * 例：npx tsx scripts/import-textbooks.ts math 人教版        # 一到六年级上下册
 *     npx tsx scripts/import-textbooks.ts chinese 统编版 2   # 二年级上下册
 */
import "dotenv/config";
import { fetchCatalog, importTextbook } from "../src/lib/textbook-import";
import { db } from "../src/lib/db";

async function main() {
  const [subject = "math", versionName = "人教版", gradeArg] = process.argv.slice(2);
  const all = await fetchCatalog();
  const books = all.filter(
    (b) => b.subjectId === subject && b.versionName === versionName && (!gradeArg || b.grade === Number(gradeArg)),
  );
  if (books.length === 0) {
    const versions = [...new Set(all.filter((b) => b.subjectId === subject).map((b) => b.versionName))];
    console.log("没有匹配的教材。可用版本：", versions.join("、"));
    return;
  }
  console.log(`将导入 ${books.length} 本：`);
  for (const b of books) console.log(`  ${b.grade}年级${b.semester === 1 ? "上" : "下"} ${b.title}`);
  for (const b of books) {
    const t0 = Date.now();
    try {
      await importTextbook(b.smarteduId, (m) => console.log(`   ${m}`));
      console.log(`✓ ${b.title} (${Math.round((Date.now() - t0) / 1000)}s)`);
    } catch (e) {
      console.log(`✗ ${b.title}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

main().finally(() => db.$disconnect());
