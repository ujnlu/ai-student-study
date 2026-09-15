export type ImagePart = { type: "image"; mimeType: string; base64: string };
export type TextPart = { type: "text"; text: string };
export type ContentPart = ImagePart | TextPart;

export type ChatMessage = {
  role: "user" | "assistant";
  content: string | ContentPart[];
};

export type ChatOptions = {
  model: string;
  system?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
};

export type ChatResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

export type JsonResult<T> = ChatResult & { data: T };

export interface AiProviderClient {
  complete(opts: ChatOptions): Promise<ChatResult>;
  /** 要求模型返回符合 schema 的 JSON */
  completeJson<T>(opts: ChatOptions, schema: import("zod").ZodType<T>): Promise<JsonResult<T>>;
  stream(opts: ChatOptions): AsyncIterable<string>;
  /** 简单连通性测试 */
  ping(model: string): Promise<{ ok: boolean; message: string; latencyMs: number }>;
}

export type ProviderConfig = {
  kind: "anthropic" | "openai-compatible";
  apiKey: string;
  baseUrl?: string | null;
};
