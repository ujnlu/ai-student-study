"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAny } from "@/lib/auth";
import { bumpMastery } from "@/lib/ai/grading";

/** 家长/孩子手动改判某题对错 */
export async function overrideAttemptAction(formData: FormData) {
  const s = await requireAny();
  const attemptId = String(formData.get("attemptId"));
  const isCorrect = formData.get("isCorrect") === "true";
  const attempt = await db.attempt.findUniqueOrThrow({ where: { id: attemptId }, include: { child: true, problem: true } });
  if (attempt.child.familyId !== s.familyId) return;

  await db.attempt.update({ where: { id: attemptId }, data: { isCorrect, overridden: true } });
  if (isCorrect) {
    await db.mistakeEntry.deleteMany({ where: { childId: attempt.childId, problemId: attempt.problemId } });
  } else {
    await db.mistakeEntry.upsert({
      where: { childId_problemId: { childId: attempt.childId, problemId: attempt.problemId } },
      create: { childId: attempt.childId, problemId: attempt.problemId, errorType: "unknown" },
      update: {},
    });
  }
  if (attempt.problem.knowledgePointId) {
    // 改判：抵消之前的记录再按新结果记一次
    await bumpMastery(attempt.childId, attempt.problem.knowledgePointId, isCorrect);
  }
  revalidatePath(`/child/uploads/${attempt.problem.uploadId}`);
  revalidatePath(`/parent/uploads/${attempt.problem.uploadId}`);
}

export async function markUnderstoodAction(formData: FormData) {
  const s = await requireAny();
  const conversationId = String(formData.get("conversationId"));
  const understood = formData.get("understood") === "true";
  const conv = await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { child: true } });
  if (conv.child.familyId !== s.familyId) return;
  await db.conversation.update({ where: { id: conversationId }, data: { understood } });
  if (conv.mistakeId) {
    await db.mistakeEntry.update({
      where: { id: conv.mistakeId },
      data: understood ? { status: "explained" } : { status: "new" },
    });
  }
  revalidatePath("/child/mistakes");
}

export async function clearMistakeAction(formData: FormData) {
  const s = await requireAny();
  const id = String(formData.get("id"));
  const m = await db.mistakeEntry.findUniqueOrThrow({ where: { id }, include: { child: true } });
  if (m.child.familyId !== s.familyId) return;
  await db.mistakeEntry.update({ where: { id }, data: { status: "cleared", clearedAt: new Date() } });
  revalidatePath("/child/mistakes");
}
