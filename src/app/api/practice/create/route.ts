import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { createOralSet, createVariantSet } from "@/lib/practice";
import { createSyncSet } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

/** POST { kind: "oral" | "variant" | "review", childId?, count?, timeLimitSec?, mistakeId? } */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { kind?: string; childId?: string; count?: number; timeLimitSec?: number | null; mistakeId?: string };
  const childId = s.childId ?? body.childId;
  if (!childId) return NextResponse.json({ error: "缺少 childId" }, { status: 400 });
  const child = await db.child.findFirst({ where: { id: childId, familyId: s.familyId } });
  if (!child) return NextResponse.json({ error: "孩子不存在" }, { status: 404 });
  try {
    if (body.kind === "oral") {
      const set = await createOralSet(childId, Math.min(50, Math.max(5, body.count ?? 20)), body.timeLimitSec === null ? null : (body.timeLimitSec ?? 300));
      return NextResponse.json({ id: set.id });
    }
    if (body.kind === "sync") {
      const subjectId = (body as { subjectId?: string }).subjectId ?? "math";
      const existing = await db.practiceSet.findFirst({ where: { childId, kind: "sync", status: "ready" }, orderBy: { createdAt: "desc" } });
      if (existing) return NextResponse.json({ id: existing.id });
      const set = await createSyncSet(childId, subjectId);
      return NextResponse.json({ id: set.id });
    }
    if (body.kind === "variant" || body.kind === "review") {
      const m = await db.mistakeEntry.findFirst({ where: { id: body.mistakeId, childId } });
      if (!m) return NextResponse.json({ error: "错题不存在" }, { status: 404 });
      const existing = await db.practiceSet.findFirst({ where: { mistakeId: m.id, kind: body.kind, status: "ready" } });
      if (existing) return NextResponse.json({ id: existing.id });
      const set = await createVariantSet(m.id, body.kind);
      return NextResponse.json({ id: set.id });
    }
    return NextResponse.json({ error: "未知类型" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
