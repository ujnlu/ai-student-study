"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { createAiSet } from "@/lib/practice";

export async function generateAiSetAction(formData: FormData) {
  const s = await requireParent();
  const childId = String(formData.get("childId"));
  const kpId = String(formData.get("knowledgePointId"));
  const count = Math.min(20, Math.max(1, Number(formData.get("count") ?? 5)));
  const difficulty = Math.min(5, Math.max(1, Number(formData.get("difficulty") ?? 2)));
  const child = await db.child.findFirst({ where: { id: childId, familyId: s.familyId } });
  if (!child) redirect("/parent/practice?error=" + encodeURIComponent("孩子不存在"));
  try {
    const set = await createAiSet(childId, kpId, count, difficulty);
    redirect(`/parent/practice/${set.id}`);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect
    redirect("/parent/practice?error=" + encodeURIComponent(e instanceof Error ? e.message : String(e)));
  }
}

export async function updatePracticeItemAction(formData: FormData) {
  const s = await requireParent();
  const itemId = String(formData.get("itemId"));
  const it = await db.practiceItem.findUniqueOrThrow({ where: { id: itemId }, include: { set: { include: { child: true } } } });
  if (it.set.child.familyId !== s.familyId) return;
  await db.problem.update({
    where: { id: it.problemId },
    data: {
      stem: String(formData.get("stem") ?? "").trim(),
      answer: String(formData.get("answer") ?? "").trim(),
      solution: String(formData.get("solution") ?? "").trim() || null,
    },
  });
  revalidatePath(`/parent/practice/${it.setId}`);
}

export async function deletePracticeItemAction(formData: FormData) {
  const s = await requireParent();
  const itemId = String(formData.get("itemId"));
  const it = await db.practiceItem.findUniqueOrThrow({ where: { id: itemId }, include: { set: { include: { child: true } } } });
  if (it.set.child.familyId !== s.familyId) return;
  await db.practiceItem.delete({ where: { id: itemId } });
  const rest = await db.practiceItem.findMany({ where: { setId: it.setId }, orderBy: { index: "asc" } });
  for (let i = 0; i < rest.length; i++) await db.practiceItem.update({ where: { id: rest[i].id }, data: { index: i } });
  await db.practiceSet.update({ where: { id: it.setId }, data: { total: rest.length } });
  revalidatePath(`/parent/practice/${it.setId}`);
}

export async function approveSetAction(formData: FormData) {
  const s = await requireParent();
  const id = String(formData.get("id"));
  const set = await db.practiceSet.findFirst({ where: { id, child: { familyId: s.familyId } } });
  if (!set) return;
  await db.practiceSet.update({ where: { id }, data: { status: "ready", title: String(formData.get("title") ?? set.title).trim() || set.title } });
  revalidatePath("/parent/practice");
  redirect("/parent/practice");
}

export async function deleteSetAction(formData: FormData) {
  const s = await requireParent();
  const id = String(formData.get("id"));
  await db.practiceSet.deleteMany({ where: { id, child: { familyId: s.familyId } } });
  revalidatePath("/parent/practice");
}
