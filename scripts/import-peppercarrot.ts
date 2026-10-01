import { db } from "@/lib/db";
import fs from "node:fs";
import path from "node:path";

const SOURCES_DIR = path.resolve(process.cwd(), "peppercarrot-sources");
// 只导入内容较完整的剧集（文件数>10）
const COMPLETE_EPS = ["ep01_Potion-of-Flight", "ep02_Rainbow-potions"];

async function importEpisode(dirName: string) {
  const epDir = path.join(SOURCES_DIR, dirName);
  const infoPath = path.join(epDir, "info.json");
  
  // 读取元数据
  let title = dirName.replace(/_/g, " ").replace(/^ep\d+ /, "");
  let published = "";
  let attribution = "Pepper & Carrot by David Revoy (CC BY 4.0)";
  
  if (fs.existsSync(infoPath)) {
    const info = JSON.parse(fs.readFileSync(infoPath, "utf-8"));
    title = `Pepper & Carrot - ${title}`;
    published = info.published || "";
  }

  // 收集lang目录下的png图片作为页面
  const langDir = path.join(epDir, "lang");
  if (!fs.existsSync(langDir)) {
    console.log(`跳过 ${dirName}: 无lang目录`);
    return;
  }
  
  const images = fs.readdirSync(langDir)
    .filter(f => f.endsWith(".png"))
    .sort();
  
  if (images.length === 0) {
    console.log(`跳过 ${dirName}: lang目录无图片`);
    return;
  }

  const slug = dirName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const coverRelPath = `comics/peppercarrot/${dirName}/lang/${images[0]}`;

  // upsert comicBook
  const book = await db.comicBook.upsert({
    where: { slug },
    create: {
      title,
      slug,
      description: `${title} - English version`,
      coverPath: coverRelPath,
      attribution,
      lang: "en",
      gradeMin: 1,
      gradeMax: 6,
      pageCount: images.length,
      sourceDir: dirName,
      status: "ready",
    },
    update: {
      title,
      coverPath: coverRelPath,
      pageCount: images.length,
      status: "ready",
    },
  });

  // 删除旧pages重建
  await db.comicPage.deleteMany({ where: { bookId: book.id } });
  
  for (let i = 0; i < images.length; i++) {
    const imgRelPath = `comics/peppercarrot/${dirName}/lang/${images[i]}`;
    await db.comicPage.create({
      data: {
        bookId: book.id,
        pageNo: i + 1,
        imagePath: imgRelPath,
      },
    });
  }

  console.log(`✅ ${title}: ${images.length}页, slug=${slug}`);
}

(async () => {
  for (const ep of COMPLETE_EPS) {
    await importEpisode(ep);
  }
  console.log("\n导入完成！");
})();
