import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ZodType } from "zod";
import type { AiProviderClient, ChatMessage, ChatOptions, ChatResult, JsonResult } from "./types";

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

  async complete(opts: ChatOptions): Promise<ChatResult> {
    // Claude 5 系列不接受 temperature 等采样参数，这里不传。
    const res = await this.client.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      messages: toMessages(opts.messages),
    });
    if (res.stop_reason === "refusal") throw new Error("模型拒绝了这次请求");
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { text, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  }

  async completeJson<T>(opts: ChatOptions, schema: ZodType<T>): Promise<JsonResult<T>> {
    const res = await this.client.messages.parse({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      messages: toMessages(opts.messages),
      output_config: { format: zodOutputFormat(schema) },
    });
    if (res.stop_reason === "refusal") throw new Error("模型拒绝了这次请求");
    if (!res.parsed_output) throw new Error("模型返回的 JSON 无法解析");
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return {
      data: res.parsed_output as T,
      text,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    };
  }

  async *stream(opts: ChatOptions): AsyncIterable<string> {
    const stream = this.client.messages.stream({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 8000,
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
