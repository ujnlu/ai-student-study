import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

export type TripPhoto = {
  id: string;
  day: number;
  caption: string;
  createdAt: string;
  url: string;
  commentCount: number;
};

export type TripComment = {
  id: string;
  photoId: string;
  author: string;
  text: string;
  createdAt: string;
};

const MAX_BYTES = 25 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function photoRoot() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.TRIP_PHOTO_DIR ?? path.join(process.cwd(), "data", "trip-photos"));
}

export async function saveTripPhoto(input: Buffer, mimeType: string, day: number, caption: string): Promise<TripPhoto> {
  if (!Number.isInteger(day) || day < 0 || day > 3) throw new Error("请选择行程日期");
  if (!IMAGE_TYPES.has(mimeType)) throw new Error("仅支持 JPG、PNG、WebP 或 HEIC 图片");
  if (!input.length || input.length > MAX_BYTES) throw new Error("每张照片不能超过 25MB");
  if (caption.length > 80) throw new Error("照片说明不能超过 80 字");

  let image: Buffer;
  try {
    image = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new Error("图片无法读取，请换一张照片再试");
  }

  const id = randomUUID();
  const photo: TripPhoto = {
    id,
    day,
    caption: caption.trim(),
    createdAt: new Date().toISOString(),
    url: `/api/grassland-trip/photos/${id}`,
    commentCount: 0,
  };
  const root = photoRoot();
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, `${id}.jpg`), image, { flag: "wx" });
  const temp = path.join(root, `${id}.json.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify(photo), { flag: "wx" });
    await fs.rename(temp, path.join(root, `${id}.json`));
  } catch (error) {
    await Promise.allSettled([fs.rm(temp, { force: true }), fs.rm(path.join(root, `${id}.jpg`), { force: true })]);
    throw error;
  }
  return photo;
}

export async function listTripPhotos(): Promise<TripPhoto[]> {
  let names: string[];
  try {
    names = await fs.readdir(/*turbopackIgnore: true*/ photoRoot());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const photos = await Promise.all(names.filter((name) => name.endsWith(".json") && ID_PATTERN.test(name.slice(0, -5))).map(async (name) => {
    try {
      const photo = JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ path.join(photoRoot(), name), "utf8")) as TripPhoto;
      return { ...photo, commentCount: await countTripComments(photo.id) };
    } catch {
      return null;
    }
  }));
  return photos.filter((photo): photo is TripPhoto => photo !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function commentRoot(photoId: string) {
  return path.join(photoRoot(), "comments", photoId);
}

async function countTripComments(photoId: string): Promise<number> {
  if (!ID_PATTERN.test(photoId)) return 0;
  try {
    const names = await fs.readdir(/*turbopackIgnore: true*/ commentRoot(photoId));
    return names.filter((name) => name.endsWith(".json") && ID_PATTERN.test(name.slice(0, -5))).length;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

export async function listTripComments(photoId: string): Promise<TripComment[]> {
  if (!ID_PATTERN.test(photoId)) return [];
  let names: string[];
  try {
    names = await fs.readdir(/*turbopackIgnore: true*/ commentRoot(photoId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const comments = await Promise.all(names.filter((name) => name.endsWith(".json") && ID_PATTERN.test(name.slice(0, -5))).map(async (name) => {
    try {
      return JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ path.join(commentRoot(photoId), name), "utf8")) as TripComment;
    } catch {
      return null;
    }
  }));
  return comments.filter((comment): comment is TripComment => comment !== null && comment.photoId === photoId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export async function saveTripComment(photoId: string, author: string, text: string): Promise<TripComment> {
  if (!ID_PATTERN.test(photoId)) throw new Error("照片不存在");
  const name = author.trim() || "旅途访客";
  const message = text.trim();
  if (name.length > 24) throw new Error("昵称不能超过 24 个字");
  if (!message || message.length > 280) throw new Error("评论需为 1—280 个字");
  try {
    await fs.access(/*turbopackIgnore: true*/ path.join(photoRoot(), `${photoId}.json`));
  } catch {
    throw new Error("照片不存在");
  }
  if (await countTripComments(photoId) >= 200) throw new Error("这张照片的评论已满");
  const comment: TripComment = { id: randomUUID(), photoId, author: name, text: message, createdAt: new Date().toISOString() };
  const root = commentRoot(photoId);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, `${comment.id}.json`), JSON.stringify(comment), { flag: "wx" });
  return comment;
}

export async function readTripPhoto(id: string): Promise<{ data: Buffer; type: "image/jpeg" } | null> {
  if (!ID_PATTERN.test(id)) return null;
  try {
    const data = await fs.readFile(/*turbopackIgnore: true*/ path.join(photoRoot(), `${id}.jpg`));
    return { data, type: "image/jpeg" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Remove a photo from the public album while retaining a server-side recovery copy. */
export async function deleteTripPhoto(id: string): Promise<boolean> {
  if (!ID_PATTERN.test(id)) return false;
  const root = photoRoot();
  const trash = path.join(root, "trash");
  await fs.mkdir(trash, { recursive: true });
  try {
    await fs.rename(path.join(root, `${id}.json`), path.join(trash, `${id}.json`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  try {
    await fs.rename(path.join(root, `${id}.jpg`), path.join(trash, `${id}.jpg`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      await fs.rename(path.join(trash, `${id}.json`), path.join(root, `${id}.json`));
      throw error;
    }
  }
  return true;
}
