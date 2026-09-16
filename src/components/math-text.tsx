import katex from "katex";
import type { ReactNode } from "react";

/**
 * 带公式的文字：$...$ / $$...$$ / \(...\) / \[...\] 里的用 KaTeX 渲染；
 * 没加定界符但明显是 LaTeX 的片段（含 \bar{z}、\frac{1}{2}、x^2、a_1 这类写法）也自动识别渲染。
 * 纯函数、无 hooks，服务端组件和客户端组件都能用。
 */

const DELIM = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;
// 裸露的公式片段：只含公式常见字符（不含中文），且至少有一个 \命令 或 ^ / _ 上下标
const BARE = /[A-Za-z0-9\u0370-\u03FF\\{}^_+\-*/=<>()[\].,|'!:;°△∠√ ]*(?:\\[A-Za-z]+|[\^_])[A-Za-z0-9\u0370-\u03FF\\{}^_+\-*/=<>()[\].,|'!:;°△∠√ ]*/g;

function tex(src: string, display: boolean): string {
  try {
    return katex.renderToString(src, { throwOnError: false, displayMode: display, strict: false, output: "html", trust: false });
  } catch {
    return escapeHtml(src);
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 在没有定界符的文字里找裸露的公式 */
function renderBare(text: string): string {
  return text.replace(BARE, (m) => {
    // 去掉两端空白和结尾的中文标点前的英文标点，避免把 "，" 前的 "," 吞进去
    const lead = /^\s*/.exec(m)![0];
    const core = m.trim().replace(/[,.;:!]+$/, "");
    const tail = m.slice(lead.length + core.length);
    if (!core || !/(?:\\[A-Za-z]+|[\^_])/.test(core)) return escapeHtml(m);
    // 只有 \\ 换行或 \n 之类不算公式
    if (!/[A-Za-z0-9]/.test(core)) return escapeHtml(m);
    return lead + tex(core, false) + escapeHtml(tail);
  });
}

export function mathToHtml(text: string): string {
  let out = "";
  let last = 0;
  DELIM.lastIndex = 0;
  for (let m = DELIM.exec(text); m; m = DELIM.exec(text)) {
    out += renderBare(escapeHtml(text.slice(last, m.index)));
    const display = m[1] !== undefined || m[4] !== undefined;
    out += tex(m[1] ?? m[2] ?? m[3] ?? m[4] ?? "", display);
    last = m.index + m[0].length;
  }
  out += renderBare(escapeHtml(text.slice(last)));
  return out;
}

/** 是否含有需要渲染的公式（用于决定要不要走 HTML 渲染） */
export function hasMath(text: string): boolean {
  DELIM.lastIndex = 0;
  if (DELIM.test(text)) return true;
  return /\\[A-Za-z]+|[A-Za-z0-9)]\^|[A-Za-z)]_[A-Za-z0-9{]/.test(text);
}

export function MathText({ text, as: Tag = "span", className, children }: { text: string; as?: "span" | "p" | "div"; className?: string; children?: ReactNode }) {
  if (!hasMath(text)) {
    return (
      <Tag className={className}>
        {text}
        {children}
      </Tag>
    );
  }
  if (children) {
    return (
      <Tag className={className}>
        <span dangerouslySetInnerHTML={{ __html: mathToHtml(text) }} />
        {children}
      </Tag>
    );
  }
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: mathToHtml(text) }} />;
}
