import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveImage } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const childId = String(form.get("childId") ?? s.childId ?? "");
  const kind = String(form.get("kind") ?? "homework");
  const subjectId = String(form.get("subjectId") ?? "") || null;
  const meta = String(form.get("meta") ?? "") || null;
  if (!(file instanceof File)) return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  const child = await db.child.findFirst({ where: { id: childId, familyId: s.familyId } });
  if (!child) return NextResponse.json({ error: "孩子不存在" }, { status: 400 });
  try {
    const upload = await saveImage(child.id, file, kind, subjectId, meta);
    return NextResponse.json({ id: upload.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "上传失败" }, { status: 400 });
  }
}
