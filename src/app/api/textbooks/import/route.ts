import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { startImportInBackground } from "@/lib/textbook-import";

export const runtime = "nodejs";

/** POST { smarteduId } 或 { smarteduIds: [] } → 后台开始导入 */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "parent") return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = (await req.json()) as { smarteduId?: string; smarteduIds?: string[] };
  const ids = body.smarteduIds ?? (body.smarteduId ? [body.smarteduId] : []);
  const started = ids.filter((id) => startImportInBackground(id));
  return NextResponse.json({ started });
}
