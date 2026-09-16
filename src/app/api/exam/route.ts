import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAdultExam, createMockExam } from "@/lib/exam";
import { getOrCreateAdultLearner } from "@/lib/adult";
import { ADULT_EXAMS, type AdultSubject } from "@/lib/topics";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST { subjectId, scope: "mid" | "final" }（孩子模拟卷）
 * POST { adult: "gongkao" | "kuaiji" | ... }（家长真题演练）
 */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { subjectId?: string; scope?: string; adult?: string };
  try {
    if (body.adult) {
      if (s.role !== "parent") return NextResponse.json({ error: "请用家长身份登录" }, { status: 401 });
      if (!(body.adult in ADULT_EXAMS)) return NextResponse.json({ error: "没有这个考试" }, { status: 404 });
      const learner = await getOrCreateAdultLearner(s.familyId);
      const existing = await db.practiceSet.findFirst({ where: { childId: learner.id, kind: "exam", topic: `exam-${body.adult}`, status: "ready" }, orderBy: { createdAt: "desc" } });
      if (existing) return NextResponse.json({ id: existing.id });
      const set = await createAdultExam(learner.id, body.adult as AdultSubject);
      return NextResponse.json({ id: set.id });
    }
    if (!s.childId) return NextResponse.json({ error: "请先用孩子身份登录" }, { status: 401 });
    const scope = body.scope === "mid" ? "mid" : "final";
    const subjectId = body.subjectId ?? "math";
    const existing = await db.practiceSet.findFirst({ where: { childId: s.childId, kind: "exam", status: "ready" }, orderBy: { createdAt: "desc" } });
    if (existing) return NextResponse.json({ id: existing.id });
    const set = await createMockExam(s.childId, subjectId, scope);
    return NextResponse.json({ id: set.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
