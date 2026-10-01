import { listTripPhotos, saveTripPhoto } from "@/lib/trip-photos";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

const windowMs = 60 * 60 * 1000;
const uploadsByAddress = new Map<string, number[]>();

export async function GET() {
  const [photos, session] = await Promise.all([listTripPhotos(), getSession()]);
  return Response.json({ photos, canDelete: Boolean(session) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && (!host || new URL(origin).host !== host)) {
    return Response.json({ error: "上传来源无效" }, { status: 403 });
  }
  const address = req.headers.get("x-real-ip") ?? "unknown";
  const now = Date.now();
  const recent = (uploadsByAddress.get(address) ?? []).filter((time) => now - time < windowMs);
  uploadsByAddress.set(address, recent);
  if (recent.length >= 20) {
    return Response.json({ error: "上传太频繁，请一小时后再试" }, { status: 429 });
  }
  try {
    if ((await listTripPhotos()).length >= 500) {
      return Response.json({ error: "相册已满，请联系站点管理员整理照片" }, { status: 507 });
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "请选择照片" }, { status: 400 });
    const photo = await saveTripPhoto(
      Buffer.from(await file.arrayBuffer()),
      file.type,
      Number(form.get("day")),
      String(form.get("caption") ?? ""),
    );
    recent.push(now);
    return Response.json({ photo }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "上传失败" }, { status: 400 });
  }
}
