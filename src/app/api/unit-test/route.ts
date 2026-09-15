import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { createUnitTest } from "@/lib/unit-test";

export const runtime = "nodejs";
export const maxDuration = 300;

/** POST { subjectId? } → 一份单元测（已有未做完的就直接用） */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s?.childId) return NextResponse.json({ error: "请先用孩子身份登录" }, { status: 401 });
  const child = await db.child.findFirst({ where: { id: s.childId, familyId: s.familyId } });
  if (!child) return NextResponse.json({ error: "孩子不存在" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { subjectId?: string };
  const subjectId = body.subjectId ?? "math";
  try {
    const existing = await db.practiceSet.findFirst({ where: { childId: child.id, kind: "unit", status: "ready" }, orderBy: { createdAt: "desc" } });
    if (existing) return NextResponse.json({ id: existing.id });
    const set = await createUnitTest(child.id, subjectId);
    return NextResponse.json({ id: set.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
