import { z, type ZodType } from "zod";
import type { AiProviderClient, ChatMessage, ChatOptions, ChatResult, JsonResult } from "./types";

/**
 * 兼容 OpenAI Chat Completions 协议的服务：DeepSeek、通义千问、智谱、Moonshot、Ollama、LM Studio 等。
 * baseUrl 形如 https://api.deepseek.com/v1
 */
type OaiPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
type OaiMessage = { role: "system" | "user" | "assistant"; content: string | OaiPart[] };

function toOai(m: ChatMessage): OaiMessage {
  if (typeof m.content === "string") return { role: m.role, content: m.content };
  return {
    role: m.role,
    content: m.content.map((p) =>
      p.type === "text"
        ? { type: "text", text: p.text }
        : { type: "image_url", image_url: { url: `data:${p.mimeType};base64,${p.base64}` } },
    ),
  };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      try {
        return JSON.parse(fence[1]);
      } catch {
        /* 继续尝试截取 */
      }
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("模型返回内容不是 JSON");
  }
}

/** 先按原样校验；不行再试"只有一个键且值为对象"的包裹形式 */
function parseWithSchema<T>(schema: ZodType<T>, raw: unknown, text: string): T {
  const first = schema.safeParse(raw);
  if (first.success) return first.data;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const keys = Object.keys(raw as Record<string, unknown>);
    if (keys.length === 1) {
      const inner = (raw as Record<string, unknown>)[keys[0]];
      const second = schema.safeParse(inner);
      if (second.success) return second.data;
    }
  }
  const issues = first.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  throw new Error(`模型返回的 JSON 不符合要求（${issues}）。原文开头：${text.slice(0, 200)}`);
}

export class OpenAICompatClient implements AiProviderClient {
  private base: string;
  constructor(
    private apiKey: string,
    baseUrl?: string | null,
  ) {
    this.base = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  }

  private async post(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    const res = await fetch(`${this.base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      // 某些服务对 max_tokens 有上限（如 8192），超过会 400：去掉该参数重试一次
      if (res.status === 400 && /max_tokens/i.test(t) && "max_tokens" in body) {
        const { max_tokens: _omit, ...rest } = body;
        void _omit;
        return this.post(rest, signal);
      }
      throw new Error(`HTTP ${res.status}: ${t.slice(0, 300)}`);
    }
    return res;
  }

  private buildMessages(opts: ChatOptions): OaiMessage[] {
    const msgs: OaiMessage[] = [];
    if (opts.system) msgs.push({ role: "system", content: opts.system });
    msgs.push(...opts.messages.map(toOai));
    return msgs;
  }

  async complete(opts: ChatOptions): Promise<ChatResult> {
    const res = await this.post({
      model: opts.model,
      messages: this.buildMessages(opts),
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 8000,
    });
    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: json.choices?.[0]?.message?.content ?? "",
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    };
  }

  async completeJson<T>(opts: ChatOptions, schema: ZodType<T>): Promise<JsonResult<T>> {
    const jsonSchema = JSON.stringify(z.toJSONSchema(schema as z.ZodType));
    const system = `${opts.system ?? ""}\n\n输出格式要求：你必须只输出一个 JSON 对象，不要输出任何其他文字、不要用 markdown 代码块。JSON 必须严格符合下面这个 JSON Schema（字段名、类型、必填项都要一致，不要额外包一层）：\n${jsonSchema}`;
    const res = await this.post({
      model: opts.model,
      messages: this.buildMessages({ ...opts, system }),
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 8000,
      response_format: { type: "json_object" },
    }).catch(() =>
      // 有些服务不支持 response_format，退回普通请求
      this.post({
        model: opts.model,
        messages: this.buildMessages({ ...opts, system }),
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 8000,
      }),
    );
    const json = (await res.json()) as {
      choices: { message: { content: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    if (json.choices?.[0]?.finish_reason === "length") {
      throw new Error(`模型输出被截断（已输出 ${json.usage?.completion_tokens ?? "?"} tokens）。请到家长端把这个助手的"最大输出 tokens"调大，或换支持更长输出的模型。`);
    }
    let raw: unknown;
    try {
      raw = extractJson(text);
    } catch (e) {
      throw new Error(`${e instanceof Error ? e.message : String(e)}（返回长度 ${text.length} 字符，开头：${text.slice(0, 120)}）`);
    }
    const data = parseWithSchema(schema, raw, text);
    return {
      data,
      text,
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    };
  }

  async *stream(opts: ChatOptions): AsyncIterable<string> {
    const res = await this.post({
      model: opts.model,
      messages: this.buildMessages(opts),
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 8000,
      stream: true,
    });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith("data:")) continue;
        const payload = l.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const j = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          /* 忽略坏行 */
        }
      }
    }
  }

  async ping(model: string) {
    const t = Date.now();
    try {
      const r = await this.complete({
        model,
        messages: [{ role: "user", content: "请只回复：OK" }],
        maxTokens: 16,
      });
      return { ok: true, message: r.text || "(空)", latencyMs: Date.now() - t };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t };
    }
  }
}
