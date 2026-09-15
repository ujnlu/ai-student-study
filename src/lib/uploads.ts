import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { db } from "@/lib/db";

export function uploadRoot() {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.UPLOAD_DIR ?? "./data/uploads");
}

export function uploadAbsPath(rel: string) {
  const abs = path.resolve(uploadRoot(), rel);
  if (!abs.startsWith(uploadRoot())) throw new Error("非法路径");
  return abs;
}

const MAX_SIDE = 2000;

/** 保存图片：统一转成 JPEG、限制长边、自动旋转 */
export async function saveImage(childId: string, file: File, kind: string, subjectId?: string | null) {
  if (!file.type.startsWith("image/")) throw new Error("只支持图片文件");
  if (file.size > 25 * 1024 * 1024) throw new Error("图片超过 25MB");
  const input = Buffer.from(await file.arrayBuffer());
  const img = sharp(input).rotate();
  const meta = await img.metadata();
  const out = await img
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });

  const day = new Date().toISOString().slice(0, 10);
  const rel = path.join(childId, day, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  const abs = uploadAbsPath(rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, out.data);

  return db.upload.create({
    data: {
      childId,
      subjectId: subjectId || null,
      kind,
      filePath: rel,
      mimeType: "image/jpeg",
      width: out.info.width ?? meta.width ?? null,
      height: out.info.height ?? meta.height ?? null,
    },
  });
}
