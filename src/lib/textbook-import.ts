/**
 * 从国家中小学智慧教育平台（basic.smartedu.cn）导入电子教材：
 * 目录 → 每本书的 PDF（公开地址；需登录的走 X-ND-AUTH 或退回页面图片）+ 章节树 + 页码映射 → 每页文字入库。
 * 仅供家庭内部学习使用，请勿传播下载的教材文件。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { ndAuthHeader, parseCreds, type SmarteduCreds } from "@/lib/smartedu-auth";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const BASE_HEADERS = { "user-agent": UA, referer: "https://basic.smartedu.cn/" };
const TAG_URL = "https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/tags/tch_material_tag.json";
const VERSION_URL = "https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/version/data_version.json";
const DETAILS_URL = (id: string) => `https://s-file-1.ykt.cbern.com.cn/zxx/ndrv2/resources/tch_material/details/${id}.json`;
const TREE_URL = (ebookId: string) => `https://s-file-1.ykt.cbern.com.cn/zxx/ndrv2/national_lesson/trees/${ebookId}.json`;
const MAX_IMAGE_PAGES = 400;

export type CatalogBook = {
  smarteduId: string;
  title: string;
  stage: string; // 小学
  subjectName: string; // 数学
  subjectId: string | null; // math
  versionName: string; // 人教版
  grade: number;
  semester: number;
  updateTime: string;
};

const SUBJECT_MAP: Record<string, string> = { 数学: "math", 语文: "chinese", 英语: "english" };
const GRADE_MAP: Record<string, number> = { 一年级: 1, 二年级: 2, 三年级: 3, 四年级: 4, 五年级: 5, 六年级: 6 };
/** 平台版本名 → 本站内置版本 code（其余版本按平台名自动新建） */
const VERSION_ALIAS: Record<string, Record<string, string>> = {
  math: { 人教版: "renjiao", 北师大版: "beishida", 苏教版: "sujiao", 西南大学版: "xishida", 北京版: "beijing", 冀教版: "jijiao", 青岛版: "qingdao" },
  chinese: { 统编版: "tongbian" },
  english: {
    "人教版（主编：吴欣）": "pep",
    "人教版（主编：苗兴伟）": "renjiao-xin",
    "外研社版（主编：刘兆义）": "waiyan",
    "外研社版（主编：孙有中）": "waiyan-yiqi",
    译林版: "yilin",
    沪教版: "hujiao-niujin",
    北师大版: "beishida-en",
  },
};

export function textbookRoot() {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.TEXTBOOK_DIR ?? "./data/textbooks");
}

// ---------- 网络 ----------

async function getCreds(): Promise<SmarteduCreds | null> {
  const row = await db.familySetting.findFirst({ where: { key: "smartedu_token" } });
  if (!row) return null;
  try {
    return parseCreds(decrypt(row.value));
  } catch {
    return null;
  }
}

function privateUrl(u: string) {
  return u.replace(/r(\d)-ndr\./, "r$1-ndr-private.");
}

/** 先试公开地址；401/403 且有凭据时改用私有地址 + X-ND-AUTH */
async function fetchAny(url: string, creds: SmarteduCreds | null): Promise<Response> {
  let res = await fetch(url, { headers: BASE_HEADERS });
  if ((res.status === 401 || res.status === 403) && creds) {
    const pu = privateUrl(url);
    res = await fetch(pu, { headers: { ...BASE_HEADERS, "x-nd-auth": ndAuthHeader(pu, "GET", creds) } });
  }
  return res;
}

async function getJson<T>(url: string, creds: SmarteduCreds | null = null): Promise<T> {
  const res = await fetchAny(url, creds);
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${url}`);
  return (await res.json()) as T;
}

class DownloadError extends Error {
  constructor(public status: number, url: string) {
    super(`下载失败 ${status}${status === 401 || status === 403 ? "（需要平台登录凭据）" : ""}: ${url.slice(0, 80)}`);
  }
}

async function download(url: string, dest: string, creds: SmarteduCreds | null, onProgress?: (pct: number) => void) {
  const res = await fetchAny(url, creds);
  if (!res.ok || !res.body) throw new DownloadError(res.status, url);
  const total = Number(res.headers.get("content-length") ?? 0);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const chunks: Uint8Array[] = [];
  let got = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (total && onProgress) onProgress(Math.round((got / total) * 100));
  }
  await fs.writeFile(dest, Buffer.concat(chunks));
  return got;
}

// ---------- 目录 ----------

let catalogCache: { at: number; books: CatalogBook[] } | null = null;

/** 拉取平台教材目录（内存缓存 6 小时） */
export async function fetchCatalog(force = false): Promise<CatalogBook[]> {
  if (!force && catalogCache && Date.now() - catalogCache.at < 6 * 3600_000) return catalogCache.books;
  type TagNode = { tag_id: string; tag_name: string; hierarchies?: { children?: TagNode[] }[] };
  const tags = await getJson<{ hierarchies: { children: TagNode[] }[] }>(TAG_URL);
  const names = new Map<string, string>();
  const walk = (n: { hierarchies?: { children?: TagNode[] }[] }) => {
    for (const h of n.hierarchies ?? []) {
      for (const c of h.children ?? []) {
        names.set(c.tag_id, c.tag_name);
        walk(c);
      }
    }
  };
  walk(tags);

  const ver = await getJson<{ urls: string }>(VERSION_URL);
  type Raw = { id: string; title?: string; tag_paths?: string[]; update_time?: string };
  const raws: Raw[] = [];
  for (const u of ver.urls.split(",")) raws.push(...(await getJson<Raw[]>(u.trim())));

  const books: CatalogBook[] = [];
  for (const r of raws) {
    const tp = r.tag_paths?.[0]?.split("/") ?? [];
    const p = tp.map((t) => names.get(t) ?? t);
    // [教材, 电子教材, 学段, 学科, 版本, 年级, 册]
    if (p.length < 7 || p[2] !== "小学") continue;
    const grade = GRADE_MAP[p[5]];
    if (!grade) continue;
    const title = r.title ?? "";
    const semester = p[6] === "上册" || /上册/.test(title) ? 1 : p[6] === "下册" || /下册/.test(title) ? 2 : 0;
    if (!semester) continue;
    books.push({
      smarteduId: r.id,
      title,
      stage: p[2],
      subjectName: p[3],
      subjectId: SUBJECT_MAP[p[3]] ?? null,
      versionName: p[4],
      grade,
      semester,
      updateTime: r.update_time ?? "",
    });
  }
  books.sort(
    (a, b) =>
      a.subjectName.localeCompare(b.subjectName) || a.versionName.localeCompare(b.versionName) || a.grade - b.grade || a.semester - b.semester,
  );
  catalogCache = { at: Date.now(), books };
  return books;
}

/** 平台版本名 → 本站 TextbookVersion（不存在则新建） */
export async function resolveVersion(subjectId: string, versionName: string) {
  const code = VERSION_ALIAS[subjectId]?.[versionName];
  if (code) {
    const v = await db.textbookVersion.findUnique({ where: { subjectId_code: { subjectId, code } } });
    if (v) return v;
  }
  const byName = await db.textbookVersion.findFirst({ where: { subjectId, name: versionName } });
  if (byName) return byName;
  return db.textbookVersion.create({
    data: {
      subjectId,
      code: `smartedu-${Buffer.from(versionName).toString("hex").slice(0, 24)}`,
      name: versionName,
      regions: "来自国家平台",
      isBuiltin: false,
    },
  });
}

// ---------- 导入 ----------

type TiItem = { ti_file_flag?: string; ti_format?: string; ti_storage?: string; ti_storages?: string[] };
function publicUrl(item: TiItem): string | null {
  let u = item.ti_storages?.find(Boolean) ?? item.ti_storage ?? null;
  if (!u) return null;
  u = u.replace("cs_path:${ref-path}", "https://r1-ndr.ykt.cbern.com.cn");
  return u.replace(/r(\d)-ndr-private\./, "r$1-ndr.");
}

type TreeNode = { id: string; title: string; child_nodes?: TreeNode[] };

async function setStatus(id: string, data: { status?: string; progress?: number; error?: string | null }) {
  await db.textbook.update({ where: { id }, data });
}

/** 把 pdfjs 的文字块按位置重排：先按行（y 相近）分组，行内按 x 排序，恢复阅读顺序 */
function layoutText(items: { str?: string; transform?: number[]; width?: number }[]): string {
  const blocks = items
    .filter((i): i is { str: string; transform: number[]; width?: number } => typeof i.str === "string" && !!i.transform && i.str.trim() !== "")
    .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], h: Math.abs(i.transform[3]) || 10 }));
  blocks.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; h: number; parts: { x: number; str: string }[] }[] = [];
  for (const b of blocks) {
    const line = lines.find((l) => Math.abs(l.y - b.y) <= Math.max(3, Math.min(l.h, b.h) * 0.6));
    if (line) line.parts.push({ x: b.x, str: b.str });
    else lines.push({ y: b.y, h: b.h, parts: [{ x: b.x, str: b.str }] });
  }
  lines.sort((a, b) => b.y - a.y);
  return lines
    .map((l) => l.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** 下载页面图片（平台公开地址），压缩后存本地；已存在的文件跳过。返回实际页数 */
async function downloadPageImages(
  textbookId: string,
  smarteduId: string,
  imageBase: string,
  creds: SmarteduCreds | null,
  knownPages: number | null,
  onProgress: (n: number) => void,
) {
  const sharp = (await import("sharp")).default;
  await fs.mkdir(path.join(textbookRoot(), smarteduId, "pages"), { recursive: true });
  const max = knownPages ?? MAX_IMAGE_PAGES;
  let count = 0;
  for (let n = 1; n <= max; n++) {
    const rel = path.join(smarteduId, "pages", `${n}.jpg`);
    const abs = path.join(textbookRoot(), rel);
    let ok = true;
    try {
      await fs.access(abs);
    } catch {
      const res = await fetchAny(`${imageBase}/${n}.jpg`, creds);
      if (!res.ok) ok = false;
      else {
        const buf = Buffer.from(await res.arrayBuffer());
        const out = await sharp(buf).resize({ width: 1400, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
        await fs.writeFile(abs, out);
      }
    }
    if (!ok) {
      if (knownPages) continue; // PDF 已知页数：个别页缺图就跳过
      break;
    }
    count = n;
    await db.textbookPage.upsert({
      where: { textbookId_pageNo: { textbookId, pageNo: n } },
      create: { textbookId, pageNo: n, text: "", imagePath: rel, ocrStatus: "none" },
      update: { imagePath: rel },
    });
    if (n % 5 === 0) onProgress(n);
  }
  return count;
}

/** 导入一本教材（可重复执行，会覆盖旧内容） */
export async function importTextbook(smarteduId: string, log: (m: string) => void = () => {}) {
  const books = await fetchCatalog();
  const book = books.find((b) => b.smarteduId === smarteduId);
  if (!book) throw new Error("目录里没有这本教材");
  if (!book.subjectId) throw new Error(`暂不支持学科：${book.subjectName}`);
  const version = await resolveVersion(book.subjectId, book.versionName);
  const creds = await getCreds();

  const tb = await db.textbook.upsert({
    where: { smarteduId },
    create: {
      smarteduId,
      textbookVersionId: version.id,
      subjectId: book.subjectId,
      grade: book.grade,
      semester: book.semester,
      title: book.title,
      status: "downloading",
      progress: 0,
      sourceUpdatedAt: book.updateTime ? new Date(book.updateTime) : null,
    },
    update: { textbookVersionId: version.id, grade: book.grade, semester: book.semester, title: book.title, status: "downloading", progress: 0, error: null },
  });

  try {
    const details = await getJson<{ ti_items?: TiItem[] }>(DETAILS_URL(smarteduId));
    const items = details.ti_items ?? [];
    const pdfItem =
      items.find((i) => i.ti_file_flag === "source" && (i.ti_format === "pdf" || /\.pdf$/i.test(i.ti_storage ?? ""))) ??
      items.find((i) => i.ti_format === "pdf");
    const pdfUrl = pdfItem ? publicUrl(pdfItem) : null;
    const imageItem = items.find((i) => i.ti_file_flag === "image" && i.ti_format === "folder");
    const imageBase = imageItem ? publicUrl(imageItem) : null;
    const mappingItem = items.find((i) => i.ti_file_flag === "ebook_mapping");
    const mappingUrl = mappingItem ? publicUrl(mappingItem) : null;
    if (!pdfUrl && !imageBase) throw new Error("平台没有提供这本书的 PDF 或页面图片");

    // 1) 正文：优先 PDF，失败退回页面图片
    const pdfPath = path.join(textbookRoot(), `${smarteduId}.pdf`);
    let contentSource: "pdf" | "images" = "pdf";
    let pageCount = 0;
    await db.textbookPage.deleteMany({ where: { textbookId: tb.id } });

    let pdfOk = false;
    if (pdfUrl) {
      log(`下载 PDF: ${pdfUrl}`);
      try {
        await download(pdfUrl, pdfPath, creds, (pct) => void setStatus(tb.id, { progress: Math.round(pct * 0.5) }));
        pdfOk = true;
      } catch (e) {
        if (!(e instanceof DownloadError) || !imageBase) throw e;
        log(`PDF 不可下载（${e.status}），改用页面图片`);
      }
    }

    if (pdfOk) {
      await setStatus(tb.id, { status: "extracting", progress: 40 });
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const data = new Uint8Array(await fs.readFile(pdfPath));
      const loadingTask = getDocument({ data, useSystemFonts: true, verbosity: 0 });
      const doc = await loadingTask.promise;
      pageCount = doc.numPages;
      const batch: { textbookId: string; pageNo: number; text: string; ocrStatus: string }[] = [];
      for (let n = 1; n <= pageCount; n++) {
        const page = await doc.getPage(n);
        const tc = await page.getTextContent();
        const text = layoutText(tc.items as { str?: string; transform?: number[]; width?: number }[]);
        batch.push({ textbookId: tb.id, pageNo: n, text, ocrStatus: "pdf" });
        if (batch.length >= 20) await db.textbookPage.createMany({ data: batch.splice(0) });
        if (n % 10 === 0) await setStatus(tb.id, { progress: 40 + Math.round((n / pageCount) * 15) });
      }
      if (batch.length) await db.textbookPage.createMany({ data: batch });
      await loadingTask.destroy();
      // 页面图片：查看原版排版和插图
      if (imageBase) {
        await setStatus(tb.id, { progress: 55 });
        const got = await downloadPageImages(tb.id, smarteduId, imageBase, creds, pageCount, (n) => void setStatus(tb.id, { progress: 55 + Math.round((n / pageCount) * 40) }));
        log(`页面图片 ${got}/${pageCount} 页`);
      }
    } else {
      contentSource = "images";
      await setStatus(tb.id, { status: "downloading", progress: 5 });
      pageCount = await downloadPageImages(tb.id, smarteduId, imageBase!, creds, null, (n) => void setStatus(tb.id, { progress: Math.min(95, 5 + Math.round((n / 150) * 90)) }));
      if (pageCount === 0) throw new Error("页面图片也无法下载");
      log(`已下载 ${pageCount} 页图片`);
    }

    // 2) 章节树 + 页码映射
    let frontPage = 0;
    const pageOf = new Map<string, number>();
    let tree: TreeNode[] = [];
    if (mappingUrl) {
      try {
        const mapping = await getJson<{ front_page?: number; ebook_id?: string; mappings?: { node_id: string; page_number: number }[] }>(mappingUrl, creds);
        frontPage = mapping.front_page ?? 0;
        for (const m of mapping.mappings ?? []) pageOf.set(m.node_id, m.page_number);
        if (mapping.ebook_id) tree = await getJson<TreeNode[]>(TREE_URL(mapping.ebook_id)).catch(() => []);
      } catch (e) {
        log(`目录映射获取失败（忽略）：${e instanceof Error ? e.message : e}`);
      }
    }
    await db.textbookChapter.deleteMany({ where: { textbookId: tb.id } });
    const flat: { node: TreeNode; level: number; parentNodeId: string | null }[] = [];
    const walk = (nodes: TreeNode[], level: number, parent: string | null) => {
      for (const n of nodes) {
        flat.push({ node: n, level, parentNodeId: parent });
        walk(n.child_nodes ?? [], level + 1, n.id);
      }
    };
    walk(tree, 0, null);
    const starts = flat.map((f) => pageOf.get(f.node.id) ?? null);
    const idByNode = new Map<string, string>();
    for (let i = 0; i < flat.length; i++) {
      const f = flat[i];
      const start = starts[i];
      let end: number | null = null;
      if (start) {
        for (let j = i + 1; j < flat.length; j++) {
          const s = starts[j];
          if (s && s > start) {
            end = s - 1;
            break;
          }
        }
        if (end === null) end = pageCount;
        if (end < start) end = start;
      }
      const row = await db.textbookChapter.create({
        data: {
          textbookId: tb.id,
          parentId: f.parentNodeId ? (idByNode.get(f.parentNodeId) ?? null) : null,
          nodeId: f.node.id,
          title: f.node.title.replace(/\s+/g, " ").trim(),
          level: f.level,
          sortOrder: i,
          pageStart: start,
          pageEnd: end,
        },
      });
      idByNode.set(f.node.id, row.id);
    }

    await db.textbook.update({
      where: { id: tb.id },
      data: {
        status: "ready",
        progress: 100,
        contentSource,
        pdfPath: pdfOk ? path.relative(process.cwd(), pdfPath) : null,
        pageCount,
        frontPage,
        importedAt: new Date(),
        error: null,
      },
    });
    await linkKnowledgePoints(tb.id);
    log(`完成：${pageCount} 页（${contentSource === "pdf" ? "PDF 文字" : "图片，待 AI 识别"}），${flat.length} 个章节节点`);
    return tb.id;
  } catch (e) {
    await setStatus(tb.id, { status: "failed", error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

// ---------- 图片版：AI 识别文字 ----------

const OCR_SYSTEM = `你是小学教材的文字录入员。把这一页教材完整、准确地转成纯文本：
- 保留标题、题号、例题编号、公式、算式、表格内容（用 | 分隔）、页码。
- 图片或插画只用【图：一句话描述】表示，不要长篇描述。
- 不要解题，不要评论，不要补充教材上没有的内容。只输出文字。`;

export async function ocrTextbook(textbookId: string, familyId: string, log: (m: string) => void = () => {}) {
  const { resolveAssistant, runComplete } = await import("@/lib/ai");
  const assistant = await resolveAssistant(familyId, "grade");
  const pages = await db.textbookPage.findMany({
    where: { textbookId, imagePath: { not: null }, ocrStatus: { not: "ocr" } },
    orderBy: { pageNo: "asc" },
  });
  const total = await db.textbookPage.count({ where: { textbookId } });
  await setStatus(textbookId, { status: "ocr", progress: Math.round(((total - pages.length) / Math.max(1, total)) * 100), error: null });
  let done = total - pages.length;
  let failures = 0;
  try {
    for (const p of pages) {
      try {
        const buf = await fs.readFile(path.join(textbookRoot(), p.imagePath!));
        const r = await runComplete(assistant, {
          system: OCR_SYSTEM,
          messages: [{ role: "user", content: [{ type: "image", mimeType: "image/jpeg", base64: buf.toString("base64") }, { type: "text", text: "请录入这一页。" }] }],
        });
        await db.textbookPage.update({ where: { id: p.id }, data: { text: r.text.trim(), ocrStatus: "ocr" } });
      } catch (e) {
        failures++;
        await db.textbookPage.update({ where: { id: p.id }, data: { ocrStatus: "failed" } });
        log(`第 ${p.pageNo} 页识别失败：${e instanceof Error ? e.message : e}`);
        if (failures >= 3 && done === total - pages.length) throw new Error(`连续识别失败，请检查"作业批改"助手的模型是否支持图片：${e instanceof Error ? e.message : e}`);
      }
      done++;
      await setStatus(textbookId, { progress: Math.round((done / Math.max(1, total)) * 100) });
    }
    await setStatus(textbookId, { status: "ready", progress: 100 });
    log(`识别完成：${done}/${total} 页，失败 ${failures} 页`);
  } catch (e) {
    await setStatus(textbookId, { status: "failed", error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

// ---------- 知识点关联 ----------

function norm(s: string) {
  return s
    .replace(/[\s、，,：:（）()～~\-—·.]/g, "")
    .replace(/的|和|与|认识|各数/g, "")
    .replace(/以内/g, "")
    .toLowerCase();
}

/** 字符重合度（0-1）：知识点名与章节标题的相似度 */
function similarity(a: string, b: string) {
  const A = new Set(Array.from(a));
  const B = new Set(Array.from(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const ch of A) if (B.has(ch)) inter++;
  return inter / Math.min(A.size, B.size);
}

/**
 * 把知识点挂到章节：先按名称匹配；该版本该年级学期还没有知识点时，直接用叶子章节生成知识点。
 */
export async function linkKnowledgePoints(textbookId: string) {
  const tb = await db.textbook.findUniqueOrThrow({ where: { id: textbookId }, include: { chapters: { orderBy: { sortOrder: "asc" } } } });
  const leaves = tb.chapters.filter((c) => !tb.chapters.some((o) => o.parentId === c.id));
  const topTitle = (c: (typeof tb.chapters)[number]) => {
    let cur = c;
    while (cur.parentId) {
      const p = tb.chapters.find((o) => o.id === cur.parentId);
      if (!p) break;
      cur = p;
    }
    return cur.title;
  };
  const kps = await db.knowledgePoint.findMany({ where: { textbookVersionId: tb.textbookVersionId, grade: tb.grade, semester: tb.semester } });
  if (kps.length === 0) {
    let order = 0;
    for (const c of leaves) {
      if (/整理和复习|总复习|练习|综合与实践|数学游戏|学习准备/.test(c.title) && c.level > 0) continue;
      await db.knowledgePoint.create({
        data: { subjectId: tb.subjectId, textbookVersionId: tb.textbookVersionId, grade: tb.grade, semester: tb.semester, unit: topTitle(c), name: c.title, sortOrder: order++, chapterId: c.id },
      });
    }
    return;
  }
  const paged = tb.chapters.filter((c) => c.pageStart);
  for (const kp of kps) {
    const a = norm(kp.name);
    let hit =
      leaves.find((c) => norm(c.title) === a) ??
      leaves.find((c) => norm(c.title).includes(a) || a.includes(norm(c.title))) ??
      null;
    if (!hit) {
      // 字符重合度最高的章节（叶子优先），阈值 0.6
      let best = 0;
      for (const c of paged) {
        const s = similarity(a, norm(c.title)) + (leaves.includes(c) ? 0.05 : 0);
        if (s > best) {
          best = s;
          hit = c;
        }
      }
      if (best < 0.6) hit = null;
    }
    if (hit) await db.knowledgePoint.update({ where: { id: kp.id }, data: { chapterId: hit.id } });
  }
}

// ---------- 后台任务（进程内） ----------

const running = new Set<string>();
export function startImportInBackground(smarteduId: string) {
  if (running.has(smarteduId)) return false;
  running.add(smarteduId);
  void importTextbook(smarteduId, (m) => console.log(`[textbook ${smarteduId.slice(0, 8)}] ${m}`))
    .catch((e) => console.error(`[textbook ${smarteduId.slice(0, 8)}] 失败:`, e))
    .finally(() => running.delete(smarteduId));
  return true;
}
export function startOcrInBackground(textbookId: string, familyId: string) {
  const key = `ocr:${textbookId}`;
  if (running.has(key)) return false;
  running.add(key);
  void ocrTextbook(textbookId, familyId, (m) => console.log(`[ocr ${textbookId.slice(0, 8)}] ${m}`))
    .catch((e) => console.error(`[ocr ${textbookId.slice(0, 8)}] 失败:`, e))
    .finally(() => running.delete(key));
  return true;
}
export function isImporting(smarteduId: string) {
  return running.has(smarteduId);
}
