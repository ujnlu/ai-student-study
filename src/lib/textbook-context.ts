import { db } from "@/lib/db";

const MAX_CHARS = 2500;

/**
 * 为 AI 准备教材原文：找到孩子当前教材（学科 + 年级 + 学期），
 * 优先用知识点挂的章节，其次按题干/知识点名称与章节标题的重合度挑章节，返回该章节页面的文字节选。
 */
export async function textbookContext(opts: {
  childId: string;
  subjectId: string;
  knowledgePointName?: string | null;
  knowledgePointId?: string | null;
  query?: string | null;
}): Promise<{ text: string; source: string } | null> {
  const child = await db.child.findUnique({ where: { id: opts.childId }, include: { textbooks: true } });
  if (!child) return null;
  const ct = child.textbooks.find((t) => t.subjectId === opts.subjectId);
  if (!ct) return null;
  const books = await db.textbook.findMany({
    where: { textbookVersionId: ct.textbookVersionId, grade: child.grade, status: "ready" },
    include: { chapters: { orderBy: { sortOrder: "asc" } } },
  });
  if (books.length === 0) return null;
  // 当前学期优先，其次另一学期
  books.sort((a, b) => (a.semester === child.semester ? -1 : 1) - (b.semester === child.semester ? -1 : 1));

  type Book = (typeof books)[number];
  type Ch = Book["chapters"][number];
  const candidates: { c: Ch; b: Book; score: number }[] = [];

  if (opts.knowledgePointId) {
    const kp = await db.knowledgePoint.findUnique({ where: { id: opts.knowledgePointId } });
    if (kp?.chapterId) {
      for (const b of books) {
        const c = b.chapters.find((x) => x.id === kp.chapterId);
        if (c?.pageStart) candidates.push({ c, b, score: 100 });
      }
    }
  }
  const q = `${opts.knowledgePointName ?? ""} ${opts.query ?? ""}`;
  const tokens = new Set(Array.from(q.replace(/[^一-龥\d]/g, "")).filter((ch) => /[一-龥]/.test(ch)));
  const kpKey = opts.knowledgePointName?.replace(/[^一-龥\d]/g, "") ?? "";
  for (const b of books) {
    for (const c of b.chapters) {
      if (!c.pageStart) continue;
      const t = c.title.replace(/[^一-龥\d]/g, "");
      let score = 0;
      for (const ch of t) if (tokens.has(ch)) score++;
      score = t.length ? score / Math.sqrt(t.length) : 0;
      if (kpKey && t.includes(kpKey)) score += 5;
      if (score >= 1.2) candidates.push({ c, b, score });
    }
  }
  candidates.sort((x, y) => y.score - x.score);

  // 依次尝试候选章节，跳过还没有文字的（图片版未识别）
  for (const { c, b } of candidates.slice(0, 5)) {
    const pages = await db.textbookPage.findMany({
      where: { textbookId: b.id, pageNo: { gte: c.pageStart!, lte: c.pageEnd ?? c.pageStart! } },
      orderBy: { pageNo: "asc" },
    });
    let text = pages.filter((p) => p.text.trim()).map((p) => `[第${Math.max(1, p.pageNo - b.frontPage)}页] ${p.text}`).join("\n");
    if (text.trim().length < 20) continue;
    if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS) + "……";
    return { text: `《${b.title}》· ${c.title}\n${text}`, source: `${b.title} · ${c.title}` };
  }
  // 退回：给目录
  const b = books[0];
  const toc = b.chapters.filter((c) => c.level <= 1).map((c) => `${"  ".repeat(c.level)}${c.title}`).join("\n").slice(0, 1200);
  return toc ? { text: `《${b.title}》目录：\n${toc}`, source: b.title } : null;
}

export function withTextbookContext(system: string, ctx: { text: string } | null) {
  if (!ctx) return system;
  return `${system}\n\n【教材原文参考（节选，讲解用语和方法请贴合教材）】\n${ctx.text}`;
}
