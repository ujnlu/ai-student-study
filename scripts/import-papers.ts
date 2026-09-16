/**
 * 批量导入真题卷（自用）：
 *   npx tsx scripts/import-papers.ts /tmp/gaokao/manifest.json            顺序解析全部
 *   npx tsx scripts/import-papers.ts /tmp/gaokao/manifest.json --check    只检查 PDF 有没有文字层，不入库
 * manifest: [{file, title, stage, subject, year, minutes}]
 * 已存在同名试卷（同 familyId + title）会跳过。解析用 AI，每份约 5-10 次调用。
 */
import fs from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { db } from "../src/lib/db";
import { createPaper, parsePaper } from "../src/lib/papers";
import { layoutText } from "../src/lib/textbook-import";

type Item = { file?: string; files?: string[]; title: string; stage: string; subject: string; year?: number; minutes?: number };

async function pdfTextLength(file: string) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await fs.readFile(file));
  const task = getDocument({ data, useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  let n = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    n += layoutText(tc.items as { str?: string; transform?: number[]; width?: number }[]).replace(/\s/g, "").length;
  }
  await task.destroy();
  return { pages: doc.numPages, chars: n };
}

async function main() {
  const [manifestPath, flag] = process.argv.slice(2);
  if (!manifestPath) throw new Error("用法: tsx scripts/import-papers.ts manifest.json [--check]");
  const items = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Item[];
  const family = await db.family.findFirstOrThrow();
  let ok = 0;
  for (const it of items) {
    const files = it.files ?? (it.file ? [it.file] : []);
    const { pages, chars } = await pdfTextLength(files[0]);
    const textOk = chars >= 200 * Math.max(1, pages) * 0.3;
    console.log(`${textOk ? "文字层OK" : "无文字层"}  ${pages} 页 ${chars} 字  ${it.title}${files.length > 1 ? "（含答案文件）" : ""}`);
    if (flag === "--check" || !textOk) continue;
    const exists = await db.paper.findFirst({ where: { familyId: family.id, title: it.title } });
    if (exists && exists.status === "ready") {
      console.log(`  已存在，跳过`);
      continue;
    }
    if (exists) {
      console.log(`  上次 ${exists.status}，重新解析`);
      const t0 = Date.now();
      await parsePaper(exists.id, family.id);
      const done = await db.paper.findUniqueOrThrow({ where: { id: exists.id } });
      console.log(`  → ${done.status} ${done.total} 题 ${Math.round((Date.now() - t0) / 1000)}s ${done.error ?? ""}`);
      if (done.status === "ready") ok++;
      continue;
    }
    const fileObjs: File[] = [];
    for (const f of files) fileObjs.push(new File([await fs.readFile(f)], path.basename(f), { type: "application/pdf" }));
    const paper = await createPaper({ familyId: family.id, title: it.title, stage: it.stage, subject: it.subject, year: it.year ?? null, minutes: it.minutes ?? 90, files: fileObjs });
    const t0 = Date.now();
    await parsePaper(paper.id, family.id);
    const done = await db.paper.findUniqueOrThrow({ where: { id: paper.id } });
    console.log(`  → ${done.status} ${done.total} 题 ${Math.round((Date.now() - t0) / 1000)}s ${done.error ?? ""}`);
    if (done.status === "ready") ok++;
  }
  console.log(`完成：${ok} 份可做`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
