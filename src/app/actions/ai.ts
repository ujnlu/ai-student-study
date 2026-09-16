"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { ensureDefaultAssistants } from "@/lib/ai";

export async function saveProviderAction(formData: FormData) {
  const s = await requireParent();
  const id = String(formData.get("id") ?? "");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const base = {
    name: String(formData.get("name") ?? "").trim() || "未命名",
    kind: String(formData.get("kind") ?? "anthropic"),
    baseUrl: String(formData.get("baseUrl") ?? "").trim() || null,
    defaultModel: String(formData.get("defaultModel") ?? "").trim() || "claude-opus-5",
    isDefault: formData.get("isDefault") === "on",
  };
  if (base.isDefault) await db.aiProvider.updateMany({ where: { familyId: s.familyId }, data: { isDefault: false } });

  let providerId = id;
  if (id) {
    await db.aiProvider.update({
      where: { id, familyId: s.familyId },
      data: { ...base, ...(apiKey ? { apiKeyEnc: encrypt(apiKey) } : {}) },
    });
  } else {
    if (!apiKey) redirect("/parent/ai?error=" + encodeURIComponent("请填写 API Key"));
    const count = await db.aiProvider.count({ where: { familyId: s.familyId } });
    const p = await db.aiProvider.create({
      data: { ...base, familyId: s.familyId, apiKeyEnc: encrypt(apiKey), isDefault: base.isDefault || count === 0 },
    });
    providerId = p.id;
  }
  await ensureDefaultAssistants(s.familyId, providerId);
  revalidatePath("/parent/ai");
  redirect("/parent/ai");
}

export async function deleteProviderAction(formData: FormData) {
  const s = await requireParent();
  await db.aiProvider.delete({ where: { id: String(formData.get("id")), familyId: s.familyId } });
  revalidatePath("/parent/ai");
}

export async function saveAssistantAction(formData: FormData) {
  const s = await requireParent();
  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "tutor");
  const data = {
    name: String(formData.get("name") ?? "").trim() || "未命名助手",
    role,
    providerId: String(formData.get("providerId") ?? ""),
    model: String(formData.get("model") ?? "").trim() || null,
    systemPrompt: String(formData.get("systemPrompt") ?? ""),
    temperature: Number(formData.get("temperature") ?? 0.3),
    maxTokens: Math.max(0, Math.floor(Number(formData.get("maxTokens")) || 0)),
    isDefault: formData.get("isDefault") === "on",
    supportVision: formData.get("supportVision") === "on",
  };
  if (data.isDefault) await db.aiAssistant.updateMany({ where: { familyId: s.familyId, role }, data: { isDefault: false } });

  if (id) {
    const prev = await db.aiAssistant.findUniqueOrThrow({ where: { id, familyId: s.familyId } });
    if (prev.systemPrompt !== data.systemPrompt) {
      await db.aiPromptVersion.create({ data: { assistantId: id, systemPrompt: prev.systemPrompt, note: "修改前的版本" } });
    }
    await db.aiAssistant.update({ where: { id }, data });
  } else {
    await db.aiAssistant.create({ data: { ...data, familyId: s.familyId } });
  }
  revalidatePath("/parent/ai");
  redirect("/parent/ai");
}

export async function deleteAssistantAction(formData: FormData) {
  const s = await requireParent();
  await db.aiAssistant.delete({ where: { id: String(formData.get("id")), familyId: s.familyId } });
  revalidatePath("/parent/ai");
}

export async function restorePromptVersionAction(formData: FormData) {
  const s = await requireParent();
  const v = await db.aiPromptVersion.findUniqueOrThrow({ where: { id: String(formData.get("versionId")) }, include: { assistant: true } });
  if (v.assistant.familyId !== s.familyId) return;
  await db.aiPromptVersion.create({ data: { assistantId: v.assistantId, systemPrompt: v.assistant.systemPrompt, note: "回滚前的版本" } });
  await db.aiAssistant.update({ where: { id: v.assistantId }, data: { systemPrompt: v.systemPrompt } });
  revalidatePath(`/parent/ai/assistants/${v.assistantId}`);
}
