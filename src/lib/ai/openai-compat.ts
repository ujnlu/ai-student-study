import { z, type ZodType } from "zod";
import type { AiProviderClient, ChatMessage, ChatOptions, ChatResult, JsonResult } from "./types";
import { appendContinuation, capFromError, CONTINUE_PROMPT, MAX_CONTINUATIONS, parseJsonText, resolveMaxTokens, truncatedError } from "./json";

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

export class OpenAICompatClient implements AiProviderClient {
  private base: string;
  constructor(
    private apiKey: string,
    baseUrl?: string | null,
  ) {
    this.base = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  }

  /** 各模型实际的输出上限（服务商 400 报错里学来的；0 = 这个服务不接受 max_tokens 参数） */
  private caps = new Map<string, number>();

  private withMax(body: Record<string, unknown>, model: string, want: number): Record<string, unknown> {
    const cap = this.caps.get(model);
    if (cap === 0) {
      const { max_tokens: _omit, ...rest } = body;
      void _omit;
      return rest;
    }
    return { ...body, max_tokens: cap ? Math.min(cap, want) : want };
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
      // 服务商对 max_tokens 有上限（DeepSeek-chat 8192、reasoner 65536 等）：从报错里读出上限重试；读不出就去掉该参数
      if (res.status === 400 && /max_tokens/i.test(t) && typeof body.max_tokens === "number") {
        const model = String(body.model ?? "");
        const cap = capFromError(t, body.max_tokens);
        this.caps.set(model, cap ?? 0);
        return this.post(this.withMax(body, model, body.max_tokens), signal);
      }
      throw new Error(`HTTP ${res.status}: ${t.slice(0, 300)}`);
    }
    return res;
  }

  private async postOnce(body: Record<string, unknown>) {
    const model = String(body.model ?? "");
    const res = await this.post(this.withMax(body, model, Number(body.max_tokens)));
    const json = (await res.json()) as {
      choices: { message: { content: string | null }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: json.choices?.[0]?.message?.content ?? "",
      truncated: json.choices?.[0]?.finish_reason === "length",
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    };
  }

  /**
   * 发请求；输出被截断（finish_reason = length）就把已有内容当作 assistant 消息接回去让模型续写，最多续几次。
   * 这样家长端不用手动调"最大输出 tokens"，长内容也能出完。
   */
  private async postWithContinuation(body: Record<string, unknown>, messages: OaiMessage[]): Promise<ChatResult> {
    let text = "";
    let inputTokens = 0;
    let outputTokens = 0;
    for (let round = 0; ; round++) {
      const r = await this.postOnce(
        round === 0
          ? { ...body, messages }
          : (() => {
              // 续写时不能再要求"只输出一个完整 JSON 对象"，否则模型会从头重来
              const { response_format: _rf, ...rest } = body;
              void _rf;
              return { ...rest, messages: [...messages, { role: "assistant", content: text }, { role: "user", content: CONTINUE_PROMPT }] };
            })(),
      );
      inputTokens += r.inputTokens;
      outputTokens += r.outputTokens;
      text = round === 0 ? r.text : appendContinuation(text, r.text);
      if (!r.truncated) return { text, inputTokens, outputTokens };
      // 推理模型把预算全花在思考上、一个字都没出：续写也没有意义
      if (!text.trim()) throw truncatedError(outputTokens, round);
      if (round >= MAX_CONTINUATIONS) throw truncatedError(outputTokens, round);
    }
  }

  private buildMessages(opts: ChatOptions): OaiMessage[] {
    const msgs: OaiMessage[] = [];
    if (opts.system) msgs.push({ role: "system", content: opts.system });
    msgs.push(...opts.messages.map(toOai));
    return msgs;
  }

  async complete(opts: ChatOptions): Promise<ChatResult> {
    return this.postWithContinuation(
      { model: opts.model, temperature: opts.temperature ?? 0.3, max_tokens: resolveMaxTokens(opts.maxTokens) },
      this.buildMessages(opts),
    );
  }

  async completeJson<T>(opts: ChatOptions, schema: ZodType<T>): Promise<JsonResult<T>> {
    const jsonSchema = JSON.stringify(z.toJSONSchema(schema as z.ZodType));
    const system = `${opts.system ?? ""}\n\n输出格式要求：你必须只输出一个 JSON 对象，不要输出任何其他文字、不要用 markdown 代码块。JSON 必须严格符合下面这个 JSON Schema（字段名、类型、必填项都要一致，不要额外包一层）：\n${jsonSchema}`;
    const messages = this.buildMessages({ ...opts, system });
    const body = { model: opts.model, temperature: opts.temperature ?? 0.2, max_tokens: resolveMaxTokens(opts.maxTokens) };
    const r = await this.postWithContinuation({ ...body, response_format: { type: "json_object" } }, messages).catch((e) => {
      // 有些服务不支持 response_format，退回普通请求
      if (e instanceof Error && /^HTTP 4\d\d/.test(e.message) && /response_format|json_object/i.test(e.message)) return this.postWithContinuation(body, messages);
      throw e;
    });
    return { ...r, data: parseJsonText(schema, r.text) };
  }

  async *stream(opts: ChatOptions): AsyncIterable<string> {
    const res = await this.post(
      this.withMax(
        { model: opts.model, messages: this.buildMessages(opts), temperature: opts.temperature ?? 0.3, max_tokens: resolveMaxTokens(opts.maxTokens), stream: true },
        opts.model,
        resolveMaxTokens(opts.maxTokens),
      ),
    );
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
