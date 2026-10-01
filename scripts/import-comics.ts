import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";

const ORGANIZED = "/home/comics/organized";
const COMICS_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./data/uploads", "comics");

interface CatalogEntry {
  slug: string;
  title: string;
  pages: number;
  cover: string;
}

async function main() {
  // 读取 catalog.json (NDJSON)
  const raw = await fs.readFile(path.join(ORGANIZED, "catalog.json"), "utf-8");
  const entries: CatalogEntry[] = raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  console.log(`📚 Found ${entries.length} books in catalog`);

  // 确保目标目录存在
  await fs.mkdir(COMICS_DIR, { recursive: true });

  let imported = 0;
  let skipped = 0;
  let totalPages = 0;

  for (const entry of entries) {
    const srcDir = path.join(ORGANIZED, entry.slug);
    const destDir = path.join(COMICS_DIR, entry.slug);

    // 检查源目录是否存在
    try {
      await fs.access(srcDir);
    } catch {
      console.warn(`⚠️  Skip ${entry.slug}: source dir not found`);
      skipped++;
      continue;
    }

    // 检查是否已导入
    const existing = await db.comicBook.findUnique({ where: { slug: entry.slug } });
    if (existing) {
      console.log(`⏭️  Skip ${entry.slug}: already imported`);
      skipped++;
      continue;
    }

    // 复制图片文件到 data/uploads/comics/<slug>/
    await fs.mkdir(destDir, { recursive: true });
    const files = await fs.readdir(srcDir);
    const jpgs = files.filter((f) => f.endsWith(".jpg")).sort();

    if (jpgs.length === 0) {
      console.warn(`⚠️  Skip ${entry.slug}: no jpg files`);
      skipped++;
      continue;
    }

    for (const jpg of jpgs) {
      await fs.copyFile(path.join(srcDir, jpg), path.join(destDir, jpg));
    }

    // 确定封面和分页
    const coverFile = jpgs.includes("cover.jpg") ? "cover.jpg" : jpgs[0];
    const pageFiles = jpgs.filter((f) => f !== "cover.jpg").sort();

    // 读取 index.md 作为描述（如果存在）
    let description: string | null = null;
    try {
      description = await fs.readFile(path.join(srcDir, "index.md"), "utf-8");
      if (description.length > 2000) description = description.slice(0, 2000);
    } catch {
      // no index.md
    }

    // 创建 ComicBook
    const book = await db.comicBook.create({
      data: {
        title: entry.title === "Title" ? entry.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : entry.title,
        slug: entry.slug,
        description,
        coverPath: `comics/${entry.slug}/${coverFile}`,
        attribution: "Book Dash (CC BY 4.0)",
        lang: "en",
        gradeMin: 1,
        gradeMax: 3,
        pageCount: pageFiles.length,
        sourceDir: entry.slug,
        status: "ready",
      },
    });

    // 创建 ComicPage
    if (pageFiles.length > 0) {
      await db.comicPage.createMany({
        data: pageFiles.map((f, i) => ({
          bookId: book.id,
          pageNo: i + 1,
          imagePath: `comics/${entry.slug}/${f}`,
        })),
      });
    }

    totalPages += pageFiles.length;
    imported++;
    console.log(`✅ ${entry.slug}: ${pageFiles.length} pages`);
  }

  console.log(`\n🎉 Done! Imported: ${imported}, Skipped: ${skipped}, Total pages: ${totalPages}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
