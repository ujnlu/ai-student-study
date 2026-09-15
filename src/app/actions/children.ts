"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";

export async function saveChildAction(formData: FormData) {
  const s = await requireParent();
  const id = String(formData.get("id") ?? "");
  const data = {
    name: String(formData.get("name") ?? "").trim() || "宝贝",
    avatar: String(formData.get("avatar") ?? "🐼"),
    grade: Number(formData.get("grade") ?? 1),
    semester: Number(formData.get("semester") ?? 1),
    region: String(formData.get("region") ?? "").trim() || null,
  };
  const child = id
    ? await db.child.update({ where: { id, familyId: s.familyId }, data })
    : await db.child.create({ data: { ...data, familyId: s.familyId } });

  // 每个学科的教材版本
  const subjects = await db.subject.findMany();
  for (const sub of subjects) {
    const tv = String(formData.get(`textbook_${sub.id}`) ?? "");
    if (!tv) continue;
    await db.childTextbook.upsert({
      where: { childId_subjectId: { childId: child.id, subjectId: sub.id } },
      create: { childId: child.id, subjectId: sub.id, textbookVersionId: tv },
      update: { textbookVersionId: tv },
    });
  }
  revalidatePath("/parent/children");
  redirect("/parent/children");
}

export async function deleteChildAction(formData: FormData) {
  const s = await requireParent();
  const id = String(formData.get("id") ?? "");
  await db.child.delete({ where: { id, familyId: s.familyId } });
  revalidatePath("/parent/children");
}

export async function addTextbookAction(formData: FormData) {
  await requireParent();
  const subjectId = String(formData.get("subjectId") ?? "math");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const code = `custom-${Date.now().toString(36)}`;
  await db.textbookVersion.create({
    data: {
      subjectId,
      code,
      name,
      publisher: String(formData.get("publisher") ?? "").trim() || null,
      regions: String(formData.get("regions") ?? "").trim() || null,
      isBuiltin: false,
    },
  });
  revalidatePath("/parent/textbooks");
}

export async function deleteTextbookAction(formData: FormData) {
  await requireParent();
  const id = String(formData.get("id") ?? "");
  const inUse = await db.childTextbook.count({ where: { textbookVersionId: id } });
  if (inUse > 0) return;
  await db.textbookVersion.delete({ where: { id, isBuiltin: false } });
  revalidatePath("/parent/textbooks");
}

export async function addKnowledgePointAction(formData: FormData) {
  await requireParent();
  const textbookVersionId = String(formData.get("textbookVersionId") ?? "");
  const tv = await db.textbookVersion.findUniqueOrThrow({ where: { id: textbookVersionId } });
  const names = String(formData.get("names") ?? "")
    .split(/[\n,，、]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const max = await db.knowledgePoint.aggregate({ where: { textbookVersionId }, _max: { sortOrder: true } });
  let order = (max._max.sortOrder ?? 0) + 1;
  for (const name of names) {
    await db.knowledgePoint.create({
      data: {
        subjectId: tv.subjectId,
        textbookVersionId,
        grade: Number(formData.get("grade") ?? 1),
        semester: Number(formData.get("semester") ?? 1),
        unit: String(formData.get("unit") ?? "").trim() || "未分单元",
        name,
        sortOrder: order++,
      },
    });
  }
  revalidatePath(`/parent/textbooks/${textbookVersionId}`);
}
