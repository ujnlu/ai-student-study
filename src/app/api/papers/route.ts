import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createPaper, parsePaper } from "@/lib/papers";

export const runtime = "nodejs";
export const maxDuration = 300;

/** POST multipart: title, stage, subject, year?, minutes?, text?, files[] → { id }；解析在后台进行 */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "parent") return NextResponse.json({ error: "请用家长身份登录" }, { status: 401 });
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const text = String(form.get("text") ?? "").trim();
  if (files.length === 0 && !text) return NextResponse.json({ error: "请上传 PDF / 图片，或粘贴试卷文本" }, { status: 400 });
  if (files.some((f) => f.size > 40 * 1024 * 1024)) return NextResponse.json({ error: "单个文件不能超过 40MB" }, { status: 400 });
  try {
    const paper = await createPaper({
      familyId: s.familyId,
      title: String(form.get("title") ?? ""),
      stage: String(form.get("stage") ?? "gaokao"),
      subject: String(form.get("subject") ?? "math"),
      year: Number(form.get("year")) || null,
      minutes: Math.min(180, Math.max(10, Number(form.get("minutes")) || 60)),
      text: text || undefined,
      files,
    });
    void parsePaper(paper.id, s.familyId);
    return NextResponse.json({ id: paper.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
