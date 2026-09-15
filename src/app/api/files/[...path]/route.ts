import fs from "node:fs/promises";
import { getSession } from "@/lib/auth";
import { uploadAbsPath } from "@/lib/uploads";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const s = await getSession();
  if (!s) return new Response("未登录", { status: 401 });
  const { path } = await ctx.params;
  try {
    const buf = await fs.readFile(uploadAbsPath(path.join("/")));
    return new Response(new Uint8Array(buf), {
      headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
