import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { createConsolidateSet, createWeeklyReviewSet } from "@/lib/consolidate";

export const runtime = "nodejs";
export const maxDuration = 300;

/** POST { kind: "consolidate" | "weekly", subjectId? } → { id }（已有没做完的同类练习就直接用） */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s?.childId) return NextResponse.json({ error: "请先用孩子身份登录" }, { status: 401 });
  const child = await db.child.findFirst({ where: { id: s.childId, familyId: s.familyId } });
  if (!child) return NextResponse.json({ error: "孩子不存在" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { kind?: string; subjectId?: string };
  const subjectId = body.subjectId ?? "math";
  if (body.kind !== "consolidate" && body.kind !== "weekly") return NextResponse.json({ error: "未知类型" }, { status: 400 });
  try {
    const existing = await db.practiceSet.findFirst({ where: { childId: child.id, kind: body.kind, status: "ready" }, orderBy: { createdAt: "desc" } });
    if (existing) return NextResponse.json({ id: existing.id });
    const set = body.kind === "consolidate" ? await createConsolidateSet(child.id, subjectId) : await createWeeklyReviewSet(child.id, subjectId);
    return NextResponse.json({ id: set.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
