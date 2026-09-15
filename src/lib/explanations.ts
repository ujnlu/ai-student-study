import { db } from "@/lib/db";

/**
 * 查出这些题目已有的讲解动画（按题目 ID 或相同题目内容），返回 problemId → explanationId。
 * 页面用它把"动画讲解"按钮直接渲染成链接，避免重复请求模型。
 */
export async function existingExplanations(
  familyId: string,
  problems: { id: string; stem: string; answer: string | null }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (problems.length === 0) return out;
  const stems = [...new Set(problems.map((p) => p.stem))];
  const rows = await db.explanation.findMany({
    where: { status: "ready", child: { familyId }, problem: { stem: { in: stems } } },
    orderBy: { createdAt: "desc" },
    select: { id: true, problemId: true, problem: { select: { stem: true, answer: true } } },
  });
  for (const p of problems) {
    const hit = rows.find((r) => r.problemId === p.id) ?? rows.find((r) => r.problem.stem === p.stem && r.problem.answer === p.answer);
    if (hit) out.set(p.id, hit.id);
  }
  return out;
}
