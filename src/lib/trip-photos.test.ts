import assert from "node:assert/strict";
import { after, test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { deleteTripPhoto, listTripComments, listTripPhotos, readTripPhoto, saveTripComment, saveTripPhoto } from "./trip-photos";

const root = path.join(os.tmpdir(), `trip-photos-${process.pid}-${Date.now()}`);
process.env.TRIP_PHOTO_DIR = root;
after(async () => { await fs.rm(root, { recursive: true, force: true }); });

const png = sharp({ create: { width: 2, height: 2, channels: 3, background: "#23785b" } }).png().toBuffer();

test("saves a photo and lists it under its trip day", async () => {
  const saved = await saveTripPhoto(await png, "image/png", 2, "清远楼留影");
  assert.equal(saved.day, 2);
  assert.equal(saved.caption, "清远楼留影");
  assert.match(saved.url, /^\/api\/grassland-trip\/photos\/[a-f0-9-]+$/);
  const listed = await listTripPhotos();
  assert.deepEqual(listed, [saved]);
  const image = await readTripPhoto(saved.id);
  assert.equal(image?.type, "image/jpeg");
  assert.ok(image && image.data.length > 0);
  assert.equal(await deleteTripPhoto(saved.id), true);
  assert.deepEqual(await listTripPhotos(), []);
  assert.equal(await readTripPhoto(saved.id), null);
  assert.equal(await fs.stat(path.join(root, "trash", `${saved.id}.jpg`)).then(() => true), true);
});

test("rejects an invalid day or nonimage file", async () => {
  await assert.rejects(saveTripPhoto(await png, "image/png", 4, ""));
  await assert.rejects(saveTripPhoto(Buffer.from("hello"), "text/plain", 0, ""));
  assert.equal(await deleteTripPhoto("../../other"), false);
  assert.equal(await deleteTripPhoto("00000000-0000-0000-0000-000000000000"), false);
});

test("saves public comments with a count on the photo", async () => {
  const photo = await saveTripPhoto(await png, "image/png", 0, "骑马留影");
  const comment = await saveTripComment(photo.id, "小杨", "  好开心！  ");
  assert.equal(comment.author, "小杨");
  assert.equal(comment.text, "好开心！");
  assert.equal((await listTripPhotos()).find((item) => item.id === photo.id)?.commentCount, 1);
  assert.deepEqual(await listTripComments(photo.id), [comment]);
  await assert.rejects(saveTripComment(photo.id, "", "  "));
  await assert.rejects(saveTripComment("../../other", "小杨", "你好"));
  assert.equal(await deleteTripPhoto(photo.id), true);
  await assert.rejects(saveTripComment(photo.id, "小杨", "照片已删除"));
});
