import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAdultExam, createMockExam, createStageExam } from "@/lib/exam";
import { STAGE_EXAMS, type ExamStage, type SecondarySubject } from "@/lib/secondary-catalog";
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
  const body = (await req.json().catch(() => ({}))) as { subjectId?: string; scope?: string; adult?: string; stage?: string };
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
    if (body.stage === "zhongkao" || body.stage === "gaokao") {
      const stage = body.stage as ExamStage;
      const subject = (body.subjectId ?? "math") as SecondarySubject;
      if (!STAGE_EXAMS[stage][subject]) return NextResponse.json({ error: "这个科目还没有模拟卷" }, { status: 404 });
      // 家长在家长端做中高考模拟卷：用隐藏的家长学习者
      const learnerId = s.childId ?? (s.role === "parent" ? (await getOrCreateAdultLearner(s.familyId)).id : null);
      if (!learnerId) return NextResponse.json({ error: "未登录" }, { status: 401 });
      const existing = await db.practiceSet.findFirst({ where: { childId: learnerId, kind: "exam", status: "ready", topic: `exam-${stage}-${subject}` }, orderBy: { createdAt: "desc" } });
      if (existing) return NextResponse.json({ id: existing.id });
      const set = await createStageExam(learnerId, stage, subject);
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
