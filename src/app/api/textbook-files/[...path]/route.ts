import fs from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/auth";
import { textbookRoot } from "@/lib/textbook-import";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const s = await getSession();
  if (!s) return new Response("未登录", { status: 401 });
  const { path: parts } = await ctx.params;
  const root = textbookRoot();
  const abs = path.resolve(root, parts.join("/"));
  if (!abs.startsWith(root)) return new Response("bad path", { status: 400 });
  try {
    const buf = await fs.readFile(abs);
    const type = abs.endsWith(".pdf") ? "application/pdf" : "image/jpeg";
    return new Response(new Uint8Array(buf), { headers: { "content-type": type, "cache-control": "private, max-age=86400" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
