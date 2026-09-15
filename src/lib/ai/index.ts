import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { AnthropicClient } from "./anthropic";
import { OpenAICompatClient } from "./openai-compat";
import type { AiProviderClient, ChatOptions } from "./types";
import { DEFAULT_PROMPTS, ROLE_LABELS, type AssistantRole } from "./prompts";
import type { ZodType } from "zod";

export { DEFAULT_PROMPTS, ROLE_LABELS };
export type { AssistantRole };

export function buildClient(kind: string, apiKey: string, baseUrl?: string | null): AiProviderClient {
  if (kind === "anthropic") return new AnthropicClient(apiKey, baseUrl);
  return new OpenAICompatClient(apiKey, baseUrl);
}

export async function clientForProvider(providerId: string) {
  const p = await db.aiProvider.findUniqueOrThrow({ where: { id: providerId } });
  return { provider: p, client: buildClient(p.kind, decrypt(p.apiKeyEnc), p.baseUrl) };
}

/** 找某角色的默认助手；没有则找该角色任意一个；再没有就抛错 */
export async function resolveAssistant(familyId: string, role: AssistantRole) {
  const a =
    (await db.aiAssistant.findFirst({ where: { familyId, role, isDefault: true }, include: { provider: true } })) ??
    (await db.aiAssistant.findFirst({ where: { familyId, role }, include: { provider: true } }));
  if (a) return a;
  // 有 Provider 但缺这个角色（例如后来新增的角色）：自动按默认模板补一个
  const provider =
    (await db.aiProvider.findFirst({ where: { familyId, isDefault: true } })) ??
    (await db.aiProvider.findFirst({ where: { familyId } }));
  if (!provider) throw new Error(`还没有配置 AI 服务，请先到家长端 → AI 设置 添加`);
  await ensureDefaultAssistants(familyId, provider.id);
  const created = await db.aiAssistant.findFirst({ where: { familyId, role }, include: { provider: true } });
  if (!created) throw new Error(`还没有配置「${ROLE_LABELS[role]}」助手，请先到家长端 → AI 设置 添加`);
  return created;
}

type Resolved = Awaited<ReturnType<typeof resolveAssistant>>;

export function assistantClient(a: Resolved) {
  return {
    client: buildClient(a.provider.kind, decrypt(a.provider.apiKeyEnc), a.provider.baseUrl),
    model: a.model || a.provider.defaultModel,
  };
}

async function logUsage(
  a: Resolved,
  model: string,
  t0: number,
  usage: { inputTokens: number; outputTokens: number } | null,
  error?: unknown,
) {
  await db.aiUsage
    .create({
      data: {
        providerId: a.providerId,
        assistantId: a.id,
        model,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        latencyMs: Date.now() - t0,
        ok: !error,
        error: error ? String(error instanceof Error ? error.message : error).slice(0, 500) : null,
      },
    })
    .catch(() => {});
}

export async function runComplete(a: Resolved, opts: Omit<ChatOptions, "model">) {
  const { client, model } = assistantClient(a);
  const t0 = Date.now();
  try {
    const r = await client.complete({ ...opts, model, temperature: a.temperature, maxTokens: a.maxTokens });
    await logUsage(a, model, t0, r);
    return r;
  } catch (e) {
    await logUsage(a, model, t0, null, e);
    throw e;
  }
}

export async function runJson<T>(a: Resolved, opts: Omit<ChatOptions, "model">, schema: ZodType<T>) {
  const { client, model } = assistantClient(a);
  const t0 = Date.now();
  try {
    const r = await client.completeJson({ ...opts, model, temperature: a.temperature, maxTokens: a.maxTokens }, schema);
    await logUsage(a, model, t0, r);
    return r;
  } catch (e) {
    await logUsage(a, model, t0, null, e);
    throw e;
  }
}

export function runStream(a: Resolved, opts: Omit<ChatOptions, "model">) {
  const { client, model } = assistantClient(a);
  const t0 = Date.now();
  const src = client.stream({ ...opts, model, temperature: a.temperature, maxTokens: a.maxTokens });
  async function* wrapped() {
    let out = 0;
    try {
      for await (const chunk of src) {
        out += chunk.length;
        yield chunk;
      }
      await logUsage(a, model, t0, { inputTokens: 0, outputTokens: Math.round(out / 2) });
    } catch (e) {
      await logUsage(a, model, t0, null, e);
      throw e;
    }
  }
  return wrapped();
}

/** 新建 Provider 时，为还没有助手的角色自动创建默认助手 */
export async function ensureDefaultAssistants(familyId: string, providerId: string) {
  for (const role of Object.keys(DEFAULT_PROMPTS) as AssistantRole[]) {
    const exists = await db.aiAssistant.findFirst({ where: { familyId, role } });
    if (exists) continue;
    await db.aiAssistant.create({
      data: {
        familyId,
        providerId,
        role,
        name: `默认 · ${ROLE_LABELS[role]}`,
        systemPrompt: DEFAULT_PROMPTS[role],
        isDefault: true,
        supportVision: role === "grade" || role === "essay",
        temperature: role === "grade" ? 0.1 : 0.4,
        maxTokens: role === "explain" ? 16000 : 8000,
      },
    });
  }
}
