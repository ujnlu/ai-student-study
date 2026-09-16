import type { ZodType } from "zod";

function tryParse(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    // 模型把 PDF / 网页里的控制字符原样带进字符串：先去掉不可见控制字符，再把裸换行 / 制表符换成空格
    const cleaned = t.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
    try {
      return JSON.parse(cleaned);
    } catch {
      return JSON.parse(cleaned.replace(/[\r\n\t]+/g, " "));
    }
  }
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return tryParse(trimmed);
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      try {
        return tryParse(fence[1]);
      } catch {
        /* 继续尝试截取 */
      }
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return tryParse(trimmed.slice(start, end + 1));
    throw new Error("模型返回内容不是 JSON");
  }
}

/** 先按原样校验；不行再试"只有一个键且值为对象"的包裹形式 */
export function parseWithSchema<T>(schema: ZodType<T>, raw: unknown, text: string): T {
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

export function parseJsonText<T>(schema: ZodType<T>, text: string): T {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (e) {
    throw new Error(`${e instanceof Error ? e.message : String(e)}（返回长度 ${text.length} 字符，开头：${text.slice(0, 120)}）`);
  }
  return parseWithSchema(schema, raw, text);
}

/** 输出上限：家长端填 0（或不填）= 自动，先按这个值请求，服务商说超上限就自动降到它的上限 */
export const AUTO_MAX_TOKENS = 65536;
/** 被截断后最多自动续写几次 */
export const MAX_CONTINUATIONS = 4;
export const CONTINUE_PROMPT = "你上一条回复在中途被截断了。请从被截断的那个字符紧接着继续输出剩下的内容：不要重复已经输出过的部分，不要解释，不要加代码块标记。";

export function resolveMaxTokens(maxTokens: number | undefined, auto = AUTO_MAX_TOKENS): number {
  return maxTokens && maxTokens > 0 ? maxTokens : auto;
}

/** 从"超过上限"的报错文本里找服务商真正的上限（如 "the valid range of max_tokens is [1, 8192]"、"> 64000"） */
export function capFromError(text: string, sent: number): number | null {
  const nums = Array.from(text.matchAll(/\d{3,7}/g), (m) => Number(m[0])).filter((n) => n >= 256 && n < sent);
  return nums.length ? Math.max(...nums) : null;
}

/**
 * 把续写的片段接到已有文本后面。模型偶尔不接着写而是从头重来（又以同样的开头输出一遍），这时用新的替换旧的。
 */
export function appendContinuation(prev: string, next: string): string {
  let piece = next.replace(/^\s*```(?:json)?\s*/, "").replace(/\s*```\s*$/, "");
  const head = prev.trimStart().slice(0, 24);
  if (head.length >= 8 && piece.trimStart().startsWith(head)) return piece;
  // 模型有时把断点前的最后几个字符又重抄一遍：找最长的重叠去掉
  const tail = prev.slice(-80);
  for (let n = Math.min(tail.length, piece.length); n >= 6; n--) {
    if (tail.endsWith(piece.slice(0, n))) {
      piece = piece.slice(n);
      break;
    }
  }
  return prev + piece;
}

export function truncatedError(outputTokens: number | undefined, rounds: number): Error {
  return new Error(
    rounds > 0
      ? `模型输出太长，自动续写 ${rounds} 次后仍没写完（共 ${outputTokens ?? "?"} tokens）。可以减少一次生成的数量，或换支持更长输出的模型。`
      : `模型把输出预算（${outputTokens ?? "?"} tokens）全用在思考上，没有产出内容。可以换非推理模型（如 deepseek-chat），或减少一次生成的数量。`,
  );
}
