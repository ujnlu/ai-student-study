import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ZodType } from "zod";
import type { AiProviderClient, ChatMessage, ChatOptions, ChatResult, JsonResult } from "./types";
import { appendContinuation, capFromError, CONTINUE_PROMPT, MAX_CONTINUATIONS, parseJsonText, resolveMaxTokens, truncatedError } from "./json";

type Block = Anthropic.MessageParam["content"];

function toBlocks(m: ChatMessage): Block {
  if (typeof m.content === "string") return m.content;
  return m.content.map((p) =>
    p.type === "text"
      ? ({ type: "text", text: p.text } as const)
      : ({
          type: "image",
          source: {
            type: "base64",
            media_type: p.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: p.base64,
          },
        } as const),
  );
}

function toMessages(msgs: ChatMessage[]): Anthropic.MessageParam[] {
  return msgs.map((m) => ({ role: m.role, content: toBlocks(m) }));
}

export class AnthropicClient implements AiProviderClient {
  private client: Anthropic;

  constructor(apiKey: string, baseUrl?: string | null) {
    // 显式指定官方地址，避免继承环境变量 ANTHROPIC_BASE_URL
    this.client = new Anthropic({ apiKey, baseURL: baseUrl || "https://api.anthropic.com" });
  }

  /** 各模型实际的输出上限（从"max_tokens 超上限"的报错里学来的） */
  private caps = new Map<string, number>();

  private maxFor(model: string, want: number) {
    const cap = this.caps.get(model);
    return cap ? Math.min(cap, want) : want;
  }

  private async create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
    try {
      return await this.client.messages.create(params);
    } catch (e) {
      // 超过该模型的输出上限：从报错里读出上限重试一次
      if (e instanceof Anthropic.BadRequestError && /max_tokens/i.test(e.message)) {
        const cap = capFromError(e.message, params.max_tokens);
        if (cap) {
          this.caps.set(params.model, cap);
          return this.client.messages.create({ ...params, max_tokens: cap });
        }
      }
      throw e;
    }
  }

  private static text(res: Anthropic.Message) {
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }

  /**
   * 发请求；输出被截断（stop_reason = max_tokens）就把已有内容接回去让模型续写，最多续几次。
   * 续写时不能带 output_config（结构化输出要求一次给完整 JSON），所以只在第一轮用。
   */
  private async createWithContinuation(base: Omit<Anthropic.MessageCreateParamsNonStreaming, "messages">, messages: Anthropic.MessageParam[]): Promise<ChatResult> {
    let text = "";
    let inputTokens = 0;
    let outputTokens = 0;
    for (let round = 0; ; round++) {
      const params: Anthropic.MessageCreateParamsNonStreaming =
        round === 0
          ? { ...base, messages }
          : (() => {
              const { output_config: _oc, ...rest } = base as Anthropic.MessageCreateParamsNonStreaming & { output_config?: unknown };
              void _oc;
              return { ...rest, messages: [...messages, { role: "assistant", content: text }, { role: "user", content: CONTINUE_PROMPT }] };
            })();
      const res = await this.create({ ...params, max_tokens: this.maxFor(params.model, params.max_tokens) });
      if (res.stop_reason === "refusal") throw new Error("模型拒绝了这次请求");
      inputTokens += res.usage.input_tokens;
      outputTokens += res.usage.output_tokens;
      const piece = AnthropicClient.text(res);
      text = round === 0 ? piece : appendContinuation(text, piece);
      if (res.stop_reason !== "max_tokens") return { text, inputTokens, outputTokens };
      if (!text.trim() || round >= MAX_CONTINUATIONS) throw truncatedError(outputTokens, round);
    }
  }

  async complete(opts: ChatOptions): Promise<ChatResult> {
    // Claude 5 系列不接受 temperature 等采样参数，这里不传。
    return this.createWithContinuation(
      { model: opts.model, max_tokens: resolveMaxTokens(opts.maxTokens, 32000), system: opts.system },
      toMessages(opts.messages),
    );
  }

  async completeJson<T>(opts: ChatOptions, schema: ZodType<T>): Promise<JsonResult<T>> {
    const r = await this.createWithContinuation(
      { model: opts.model, max_tokens: resolveMaxTokens(opts.maxTokens, 32000), system: opts.system, output_config: { format: zodOutputFormat(schema) } },
      toMessages(opts.messages),
    );
    return { ...r, data: parseJsonText(schema, r.text) };
  }

  async *stream(opts: ChatOptions): AsyncIterable<string> {
    const stream = this.client.messages.stream({
      model: opts.model,
      max_tokens: this.maxFor(opts.model, resolveMaxTokens(opts.maxTokens, 32000)),
      system: opts.system,
      messages: toMessages(opts.messages),
    });
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text;
    }
  }

  async ping(model: string) {
    const t = Date.now();
    try {
      const res = await this.client.messages.create({
        model,
        max_tokens: 32,
        messages: [{ role: "user", content: "请只回复：OK" }],
      });
      const text = res.content.find((b) => b.type === "text");
      return { ok: true, message: text?.type === "text" ? text.text : "(空)", latencyMs: Date.now() - t };
    } catch (e) {
      const msg =
        e instanceof Anthropic.AuthenticationError
          ? "API Key 无效"
          : e instanceof Anthropic.NotFoundError
            ? `模型 ${model} 不存在`
            : e instanceof Anthropic.APIError
              ? `API 错误 ${e.status}: ${e.message}`
              : e instanceof Error
                ? e.message
                : String(e);
      return { ok: false, message: msg, latencyMs: Date.now() - t };
    }
  }
}
