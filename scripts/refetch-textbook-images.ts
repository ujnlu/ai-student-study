/**
 * 补拉教材页面图片：npx tsx scripts/refetch-textbook-images.ts [并发数]
 * 用于新机器部署后 data/textbooks 目录为空的情况：按数据库里已有的 TextbookPage.imagePath，
 * 从国家中小学智慧教育平台的公开地址重新下载缺失的页面图片（与 textbook-import 同样压缩到宽 1400、质量 80）。
 * 已存在的文件跳过，可反复运行。仅供家庭内部学习使用。
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";
import { textbookRoot } from "../src/lib/textbook-import";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const HEADERS = { "user-agent": UA, referer: "https://basic.smartedu.cn/" };
const DETAILS_URL = (id: string) => `https://s-file-1.ykt.cbern.com.cn/zxx/ndrv2/resources/tch_material/details/${id}.json`;
const CONCURRENCY = Number(process.argv[2] ?? 8);

type TiItem = { ti_file_flag?: string; ti_format?: string; ti_storage?: string; ti_storages?: string[] };

async function imageBaseOf(smarteduId: string): Promise<string | null> {
  const res = await fetch(DETAILS_URL(smarteduId), { headers: HEADERS });
  if (!res.ok) throw new Error(`details ${res.status}`);
  const j = (await res.json()) as { ti_items?: TiItem[] };
  const item = (j.ti_items ?? []).find((i) => i.ti_file_flag === "image" && i.ti_format === "folder");
  let u = item?.ti_storages?.find(Boolean) ?? item?.ti_storage ?? null;
  if (!u) return null;
  u = u.replace("cs_path:${ref-path}", "https://r1-ndr.ykt.cbern.com.cn");
  return u.replace(/r(\d)-ndr-private\./, "r$1-ndr.");
}

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function fetchWithRetry(url: string, tries = 3): Promise<Buffer | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return null;
}

async function main() {
  const sharp = (await import("sharp")).default;
  const root = textbookRoot();
  const books = await db.textbook.findMany({
    select: { id: true, smarteduId: true, title: true, pages: { select: { pageNo: true, imagePath: true }, orderBy: { pageNo: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  let totalMissing = 0;
  let done = 0;
  let failed = 0;
  const t0 = Date.now();
  for (const [bi, book] of books.entries()) {
    const missing: { pageNo: number; rel: string }[] = [];
    for (const p of book.pages) {
      if (!p.imagePath) continue;
      if (!(await exists(path.join(root, p.imagePath)))) missing.push({ pageNo: p.pageNo, rel: p.imagePath });
    }
    if (missing.length === 0) continue;
    totalMissing += missing.length;
    let base: string | null;
    try {
      base = await imageBaseOf(book.smarteduId);
    } catch (e) {
      console.log(`[${bi + 1}/${books.length}] ${book.title} 详情获取失败：${e instanceof Error ? e.message : e}`);
      failed += missing.length;
      continue;
    }
    if (!base) {
      console.log(`[${bi + 1}/${books.length}] ${book.title} 平台无页面图片`);
      failed += missing.length;
      continue;
    }
    await fs.mkdir(path.join(root, book.smarteduId, "pages"), { recursive: true });
    let idx = 0;
    let bookFail = 0;
    const worker = async () => {
      while (idx < missing.length) {
        const m = missing[idx++];
        try {
          const buf = await fetchWithRetry(`${base}/${m.pageNo}.jpg`);
          if (!buf) {
            bookFail++;
            continue;
          }
          const out = await sharp(buf).resize({ width: 1400, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
          const abs = path.join(root, m.rel);
          await fs.writeFile(abs + ".tmp", out);
          await fs.rename(abs + ".tmp", abs);
          done++;
        } catch (e) {
          bookFail++;
          console.log(`  第 ${m.pageNo} 页失败：${e instanceof Error ? e.message : e}`);
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    failed += bookFail;
    const secs = Math.round((Date.now() - t0) / 1000);
    console.log(`[${bi + 1}/${books.length}] ${book.title}：补 ${missing.length - bookFail}/${missing.length} 页，累计 ${done} 页，失败 ${failed}，用时 ${secs}s`);
  }
  console.log(`完成：缺失 ${totalMissing} 页，下载 ${done} 页，失败 ${failed} 页，用时 ${Math.round((Date.now() - t0) / 1000)}s`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
