/**
 * 把本机解析好的真题卷同步到线上（只动 Paper 和 topic=paper-* 的 Problem，不碰其他数据）：
 *   本机：npx tsx scripts/sync-papers.ts export /tmp/papers.json     导出 status=ready 的试卷及题目
 *   线上：npx tsx scripts/sync-papers.ts import /tmp/papers.json     按 id upsert（已存在的整份替换题目）
 * 附带的原始 PDF 在 data/uploads/papers/<id>/，用 rsync 单独同步（不同步也能做题，只是详情页看不到原文件）。
 */
import fs from "node:fs/promises";
import "dotenv/config";
import { db } from "../src/lib/db";

type Dump = {
  papers: {
    paper: { id: string; title: string; stage: string; subject: string; year: number | null; source: string; filePaths: string | null; status: string; total: number; minutes: number; createdAt: string };
    problems: { id: string; subjectId: string | null; index: number; kind: string | null; stem: string; answer: string | null; solution: string | null; difficulty: number; walkthrough: string | null }[];
  }[];
};

async function main() {
  const [mode, file] = process.argv.slice(2);
  if (mode === "export") {
    const papers = await db.paper.findMany({ where: { status: "ready" }, orderBy: { createdAt: "asc" } });
    const out: Dump = { papers: [] };
    for (const p of papers) {
      const problems = await db.problem.findMany({ where: { topic: `paper-${p.id}` }, orderBy: { index: "asc" } });
      out.papers.push({
        paper: { id: p.id, title: p.title, stage: p.stage, subject: p.subject, year: p.year, source: p.source, filePaths: p.filePaths, status: p.status, total: p.total, minutes: p.minutes, createdAt: p.createdAt.toISOString() },
        problems: problems.map((q) => ({ id: q.id, subjectId: q.subjectId, index: q.index, kind: q.kind, stem: q.stem, answer: q.answer, solution: q.solution, difficulty: q.difficulty, walkthrough: q.walkthrough })),
      });
    }
    await fs.writeFile(file, JSON.stringify(out));
    console.log(`导出 ${out.papers.length} 份，${out.papers.reduce((a, p) => a + p.problems.length, 0)} 题 → ${file}`);
    return;
  }
  if (mode === "import") {
    const dump = JSON.parse(await fs.readFile(file, "utf8")) as Dump;
    const family = await db.family.findFirstOrThrow();
    let n = 0;
    for (const { paper, problems } of dump.papers) {
      const topic = `paper-${paper.id}`;
      await db.paper.upsert({
        where: { id: paper.id },
        create: { id: paper.id, familyId: family.id, title: paper.title, stage: paper.stage, subject: paper.subject, year: paper.year, source: paper.source, filePaths: paper.filePaths, status: "ready", total: paper.total, minutes: paper.minutes, createdAt: new Date(paper.createdAt) },
        update: { title: paper.title, stage: paper.stage, subject: paper.subject, year: paper.year, source: paper.source, filePaths: paper.filePaths, status: "ready", total: paper.total, minutes: paper.minutes },
      });
      // 已有练习记录引用的题目不删，按 id upsert
      for (const q of problems) {
        await db.problem.upsert({
          where: { id: q.id },
          create: { id: q.id, subjectId: q.subjectId, topic, index: q.index, kind: q.kind, stem: q.stem, answer: q.answer, solution: q.solution, difficulty: q.difficulty, walkthrough: q.walkthrough, source: "bank" },
          update: { subjectId: q.subjectId, topic, index: q.index, kind: q.kind, stem: q.stem, answer: q.answer, solution: q.solution, difficulty: q.difficulty, walkthrough: q.walkthrough ?? undefined },
        });
      }
      n++;
      console.log(`✓ ${paper.title}（${problems.length} 题）`);
    }
    console.log(`导入 ${n} 份`);
    return;
  }
  throw new Error("用法: sync-papers.ts export|import <file>");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
