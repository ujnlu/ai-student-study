/**
 * 真题卷导入（自用）：家长上传 PDF / 图片 / 文本 → 提取原文 → AI 分段拆题（保留题号、选项、答案、解析）→ 入库为 Problem(topic = paper-<id>)。
 * 做卷：按原卷顺序整卷限时；选择 / 填空自动判分，解答题看参考答案自评；每题可看解题讲解。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import sharp from "sharp";
import { db } from "@/lib/db";
import { resolveAssistant, runComplete, runJson } from "@/lib/ai";
import { layoutText } from "@/lib/textbook-import";
import { uploadAbsPath, uploadRoot } from "@/lib/uploads";
import { SUBJECT_NAME, type TopicSubject } from "@/lib/topics";

export const PAPER_STAGES: Record<string, string> = { gaokao: "高考", zhongkao: "中考", other: "其他" };
export const paperCode = (id: string) => `paper-${id}`;
const CHUNK = 1500; // 每段拆出的题目 JSON 要控制在模型单次输出上限内

const Extracted = z.object({
  problems: z.array(
    z.object({
      no: z.number().int().describe("原卷题号"),
      kind: z.enum(["choice", "fill", "subjective"]),
      module: z.string().describe("题型 / 板块，如 单选、填空、解答、阅读理解"),
      stem: z.string().describe("完整题干；选择题把选项按 A. B. C. D. 各占一行写在题干末尾"),
      answer: z.string().describe("答案：选择写字母；填空写唯一答案；解答题写参考答案要点；原文没有答案就留空"),
      solution: z.string().describe("只抄原文里已有的解析，原文没有就留空字符串，不要自己写"),
      difficulty: z.number().int().min(1).max(5),
    }),
  ),
  answers: z.array(z.object({ no: z.number().int(), answer: z.string(), solution: z.string() })).describe("如果这一段是答案 / 解析部分，把每题的答案放这里"),
});
const Solved = z.object({ items: z.array(z.object({ no: z.number().int(), answer: z.string(), solution: z.string() })) });

export type PaperInput = { familyId: string; title: string; stage: string; subject: string; year?: number | null; minutes?: number; text?: string; files?: File[] };

export async function createPaper(input: PaperInput) {
  const paper = await db.paper.create({
    data: { familyId: input.familyId, title: input.title.trim() || "未命名试卷", stage: input.stage, subject: input.subject, year: input.year ?? null, minutes: input.minutes ?? 60, source: input.text ? "text" : "pdf", rawText: input.text?.trim() || null },
  });
  const rel: string[] = [];
  const dir = path.join("papers", paper.id);
  await fs.mkdir(uploadAbsPath(dir), { recursive: true });
  let source = input.text ? "text" : "pdf";
  for (const [i, f] of (input.files ?? []).entries()) {
    const buf = Buffer.from(await f.arrayBuffer());
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      const p = path.join(dir, `${i + 1}.pdf`);
      await fs.writeFile(uploadAbsPath(p), buf);
      rel.push(p);
      source = "pdf";
    } else if (f.type.startsWith("image/")) {
      const p = path.join(dir, `${i + 1}.jpg`);
      await fs.writeFile(uploadAbsPath(p), await sharp(buf).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer());
      rel.push(p);
      source = "image";
    } else if (/\.(txt|md)$/i.test(f.name) || f.type.startsWith("text/")) {
      const t = buf.toString("utf8");
      await db.paper.update({ where: { id: paper.id }, data: { rawText: ((await db.paper.findUnique({ where: { id: paper.id } }))?.rawText ?? "") + "\n" + t } });
      source = "text";
    }
  }
  return db.paper.update({ where: { id: paper.id }, data: { filePaths: JSON.stringify(rel), source } });
}

async function extractText(paperId: string, familyId: string): Promise<string> {
  const paper = await db.paper.findUniqueOrThrow({ where: { id: paperId } });
  const parts: string[] = [];
  if (paper.rawText?.trim()) parts.push(paper.rawText.trim());
  const files = (JSON.parse(paper.filePaths ?? "[]") as string[]).map((p) => uploadAbsPath(p));
  for (const abs of files) {
    if (abs.endsWith(".pdf")) {
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const data = new Uint8Array(await fs.readFile(abs));
      const task = getDocument({ data, useSystemFonts: true, verbosity: 0 });
      const doc = await task.promise;
      const pages: string[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const tc = await page.getTextContent();
        pages.push(layoutText(tc.items as { str?: string; transform?: number[]; width?: number }[]));
      }
      await task.destroy();
      const text = pages.join("\n\n");
      if (text.replace(/\s/g, "").length < 200) throw new Error("这个 PDF 几乎没有文字层（可能是扫描件），请转成图片再上传，或粘贴文本");
      parts.push(text);
    } else {
      // 图片：用支持看图的「作业批改」助手抄写原文
      const assistant = await resolveAssistant(familyId, "grade");
      if (!assistant.supportVision) throw new Error("当前批改助手的模型不支持看图，图片版试卷请换成 PDF / 文本，或在 AI 设置里换支持图片的模型");
      const buf = await fs.readFile(abs);
      const r = await runComplete(assistant, {
        system: "你是细心的试卷录入员。把图片里的试卷内容逐字抄写成文本：保留题号、选项字母（A. B. C. D. 各占一行）、公式用文字或 LaTeX 写出；不要解题、不要评论。看不清的字用□代替。",
        messages: [{ role: "user", content: [{ type: "image", mimeType: "image/jpeg", base64: buf.toString("base64") }, { type: "text", text: "请抄写这一页。" }] }],
      });
      parts.push(r.text.trim());
    }
  }
  const all = parts.join("\n\n").trim();
  if (!all) throw new Error("没有可用的文字内容");
  return all;
}

/** 按行切段，段与段之间保留约 300 字重叠，避免一道题被切在两段中间 */
function chunk(text: string, size = CHUNK, overlap = 300) {
  const lines = text.split("\n");
  const out: string[] = [];
  let cur: string[] = [];
  let len = 0;
  for (const l of lines) {
    if (len + l.length + 1 > size && cur.length) {
      out.push(cur.join("\n"));
      const keep: string[] = [];
      let k = 0;
      for (let i = cur.length - 1; i >= 0 && k < overlap; i--) {
        keep.unshift(cur[i]);
        k += cur[i].length + 1;
      }
      cur = keep;
      len = k;
    }
    cur.push(l);
    len += l.length + 1;
  }
  if (cur.length) out.push(cur.join("\n"));
  return out;
}

/** 后台解析：提取原文 → 分段拆题 → 补答案 → 入库 */
export async function parsePaper(paperId: string, familyId: string) {
  await db.paper.update({ where: { id: paperId }, data: { status: "parsing", error: null } });
  try {
    const paper = await db.paper.findUniqueOrThrow({ where: { id: paperId } });
    const text = await extractText(paperId, familyId);
    await db.paper.update({ where: { id: paperId }, data: { rawText: text } });
    const assistant = await resolveAssistant(familyId, "generate");
    const subjectName = SUBJECT_NAME[paper.subject as TopicSubject] ?? paper.subject;
    const stageName = PAPER_STAGES[paper.stage] ?? paper.stage;
    const system =
      `你是${stageName}${subjectName}教研老师，正在把一份真题卷的原文整理成题库。` +
      `\n规则：逐题提取，保留原卷题号（no）；选择题 kind=choice，把选项按 A. B. C. D. 各占一行放在题干末尾，answer 只写字母；填空题 kind=fill，answer 只写最终答案；解答题 / 作文 / 阅读简答 kind=subjective，answer 写参考答案要点（原文没有答案就自己解出来，数学物理要给出最终结果）；` +
      `\n原文里的公式保持原样或改写为可读文本；不要遗漏小题（如 17(1)(2) 可拆成 17.1、17.2 两题，no 用 1701、1702）；` +
      `\n如果这一段是"参考答案 / 解析"部分，不要当题目，把每题答案放进 answers。` +
      `\n输出要精简：题干照抄不要改写，answer 和 solution 只用原文里有的内容，缺就留空（后面会单独补），不要在这一步解题；相邻两段有少量重叠，重复出现的题照常输出（程序会去重）。`;
    const byNo = new Map<number, z.infer<typeof Extracted>["problems"][number]>();
    const answerMap = new Map<number, { answer: string; solution: string }>();
    const chunks = chunk(text);
    for (let i = 0; i < chunks.length; i++) {
      const r = await runJson(assistant, { system, messages: [{ role: "user", content: `试卷：${paper.title}（第 ${i + 1}/${chunks.length} 段）\n\n${chunks[i]}` }] }, Extracted);
      for (const p of r.data.problems) {
        if (!p.stem.trim()) continue;
        const prev = byNo.get(p.no);
        if (!prev || p.stem.length > prev.stem.length) byNo.set(p.no, { ...p, answer: p.answer || prev?.answer || "", solution: p.solution || prev?.solution || "" });
      }
      for (const a of r.data.answers) answerMap.set(a.no, { answer: a.answer, solution: a.solution });
    }
    for (const [no, a] of answerMap) {
      const p = byNo.get(no);
      if (p) {
        if (!p.answer.trim() && a.answer.trim()) p.answer = a.answer;
        if (!p.solution.trim() && a.solution.trim()) p.solution = a.solution;
      }
    }
    // 没有答案的题：让 AI 解
    const missing = [...byNo.values()].filter((p) => !p.answer.trim());
    for (let i = 0; i < missing.length; i += 5) {
      const batch = missing.slice(i, i + 5);
      const r = await runJson(
        assistant,
        { system: `你是${stageName}${subjectName}老师，请解答下面的题目：选择题 answer 只写字母，填空题只写最终答案，解答题 answer 写参考答案要点（100 字内）；solution 写简要解析（80 字内）。`, messages: [{ role: "user", content: batch.map((p) => `【${p.no}】${p.stem}`).join("\n\n") }] },
        Solved,
      );
      for (const s of r.data.items) {
        const p = byNo.get(s.no);
        if (p) {
          p.answer = s.answer;
          if (!p.solution.trim()) p.solution = s.solution;
        }
      }
    }
    const list = [...byNo.values()].sort((a, b) => a.no - b.no);
    if (list.length === 0) throw new Error("没有识别出题目，请检查原文格式");
    const dbSubject = ["math", "chinese", "english"].includes(paper.subject) ? paper.subject : null;
    await db.problem.deleteMany({ where: { topic: paperCode(paperId) } });
    for (const [i, p] of list.entries()) {
      await db.problem.create({
        data: { subjectId: dbSubject, topic: paperCode(paperId), index: i, kind: p.kind, stem: p.stem.trim(), answer: p.answer.trim() || "（见解析）", solution: `【${p.module}】${p.solution}`.trim(), difficulty: p.difficulty, source: "bank" },
      });
    }
    await db.paper.update({ where: { id: paperId }, data: { status: "ready", total: list.length } });
  } catch (e) {
    await db.paper.update({ where: { id: paperId }, data: { status: "failed", error: e instanceof Error ? e.message : String(e) } });
  }
}

/** 整卷做题：按原卷顺序 */
export async function createPaperSet(learnerId: string, paperId: string) {
  const paper = await db.paper.findUniqueOrThrow({ where: { id: paperId } });
  if (paper.status !== "ready") throw new Error("这份试卷还没解析完");
  const problems = await db.problem.findMany({ where: { topic: paperCode(paperId) }, orderBy: { index: "asc" } });
  if (problems.length === 0) throw new Error("这份试卷没有题目");
  const set = await db.practiceSet.create({ data: { childId: learnerId, kind: "exam", title: `真题：${paper.title}`, status: "ready", topic: paperCode(paperId), timeLimitSec: paper.minutes * 60, total: problems.length } });
  for (let i = 0; i < problems.length; i++) await db.practiceItem.create({ data: { setId: set.id, index: i, problemId: problems[i].id } });
  return set;
}

export async function deletePaper(paperId: string, familyId: string) {
  const paper = await db.paper.findFirst({ where: { id: paperId, familyId } });
  if (!paper) return;
  await db.problem.deleteMany({ where: { topic: paperCode(paperId) } });
  await db.paper.delete({ where: { id: paperId } });
  await fs.rm(path.join(uploadRoot(), "papers", paperId), { recursive: true, force: true }).catch(() => {});
}
