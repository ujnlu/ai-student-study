import { getSession } from "@/lib/auth";
import { deleteTripPhoto, readTripPhoto } from "@/lib/trip-photos";

export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const photo = await readTripPhoto(id);
  if (!photo) return new Response("照片不存在", { status: 404 });
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.type,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "登录后才可以删除照片" }, { status: 401 });
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && (!host || new URL(origin).host !== host)) {
    return Response.json({ error: "删除来源无效" }, { status: 403 });
  }
  const { id } = await context.params;
  if (!(await deleteTripPhoto(id))) return Response.json({ error: "照片不存在" }, { status: 404 });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
