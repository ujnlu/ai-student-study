import { listTripComments, readTripPhoto, saveTripComment } from "@/lib/trip-photos";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Context) {
  const { id } = await context.params;
  if (!(await readTripPhoto(id))) return Response.json({ error: "照片不存在" }, { status: 404 });
  return Response.json({ comments: await listTripComments(id) }, { headers: { "Cache-Control": "no-store" } });
}

const windowMs = 60 * 60 * 1000;
const commentsByAddress = new Map<string, number[]>();

export async function POST(req: Request, context: Context) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && (!host || new URL(origin).host !== host)) {
    return Response.json({ error: "评论来源无效" }, { status: 403 });
  }
  const address = req.headers.get("x-real-ip") ?? "unknown";
  const now = Date.now();
  const recent = (commentsByAddress.get(address) ?? []).filter((time) => now - time < windowMs);
  commentsByAddress.set(address, recent);
  if (recent.length >= 30) return Response.json({ error: "评论太频繁，请一小时后再试" }, { status: 429 });
  try {
    const raw = await req.text();
    if (raw.length > 2000) return Response.json({ error: "评论内容过长" }, { status: 413 });
    const data = JSON.parse(raw) as { author?: unknown; text?: unknown };
    if (typeof data.author !== "string" || typeof data.text !== "string") {
      return Response.json({ error: "请填写评论内容" }, { status: 400 });
    }
    const { id } = await context.params;
    const comment = await saveTripComment(id, data.author, data.text);
    recent.push(now);
    return Response.json({ comment }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "评论失败" }, { status: 400 });
  }
}
