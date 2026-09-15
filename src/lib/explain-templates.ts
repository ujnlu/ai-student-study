/**
 * 常见题型的"秒出"讲解动画：不调用模型，用代码生成分步 SVG + 旁白。
 * 覆盖：整数加减（凑十/破十/竖式进退位）、表内乘除、有余数除法、乘加乘减、
 * 多位数乘一位数、小数加减、同分母分数加减、单位换算。
 */
import type { ExplanationStep } from "@/lib/ai/explain";

export type TemplateExplanation = { title: string; steps: ExplanationStep[]; summary: string; quiz: { question: string; answer: string } };

// ---------- SVG 工具 ----------
const W = 800;
const H = 450;
const C = { orange: "#f97316", blue: "#3b82f6", green: "#22c55e", yellow: "#fbbf24", red: "#ef4444", gray: "#9ca3af", light: "#fde68a", sky: "#bfdbfe" };

function svg(inner: string) {
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}'><rect width='${W}' height='${H}' fill='#ffffff'/>${inner}</svg>`;
}
function text(x: number, y: number, s: string, size = 36, fill = "#1f2937", anchor: "start" | "middle" | "end" = "middle", weight = "normal") {
  return `<text x='${x}' y='${y}' font-size='${size}' fill='${fill}' text-anchor='${anchor}' font-weight='${weight}' font-family='system-ui, PingFang SC, sans-serif'>${esc(s)}</text>`;
}
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function title(s: string) {
  return text(W / 2, 56, s, 34, C.orange, "middle", "bold");
}
/** 一排圆点/方块 */
function dots(n: number, x: number, y: number, color: string, size = 26, gap = 8, perRow = 10, shape: "circle" | "rect" = "circle") {
  let out = "";
  for (let i = 0; i < n; i++) {
    const cx = x + (i % perRow) * (size + gap);
    const cy = y + Math.floor(i / perRow) * (size + gap);
    out += shape === "circle"
      ? `<circle cx='${cx + size / 2}' cy='${cy + size / 2}' r='${size / 2}' fill='${color}'/>`
      : `<rect x='${cx}' y='${cy}' width='${size}' height='${size}' rx='5' fill='${color}'/>`;
  }
  return out;
}
/** 竖式 */
function column(rows: { s: string; color?: string }[], op: string, x: number, y: number, carries?: { pos: number; v: string; color: string }[], answer?: string, highlightCol?: number) {
  const cell = 56;
  const size = 44;
  const maxLen = Math.max(...rows.map((r) => r.s.length), answer?.length ?? 0);
  let out = "";
  const draw = (s: string, yy: number, color = "#1f2937") => {
    let o = "";
    for (let i = 0; i < s.length; i++) {
      const col = maxLen - s.length + i;
      const hl = highlightCol !== undefined && col === highlightCol;
      o += text(x + col * cell + cell / 2, yy, s[i], size, hl ? C.red : color, "middle", hl ? "bold" : "normal");
    }
    return o;
  };
  rows.forEach((r, i) => (out += draw(r.s, y + i * 62, r.color)));
  out += text(x - 36, y + (rows.length - 1) * 62, op, size, C.blue);
  const lineY = y + (rows.length - 1) * 62 + 16;
  out += `<line x1='${x - 40}' y1='${lineY}' x2='${x + maxLen * cell + 8}' y2='${lineY}' stroke='#1f2937' stroke-width='3'/>`;
  if (carries) for (const c of carries) out += text(x + c.pos * cell + cell / 2, y - 30, c.v, 24, c.color, "middle", "bold");
  if (answer) out += draw(answer, lineY + 52, C.green);
  if (highlightCol !== undefined) out += `<rect x='${x + highlightCol * cell + 4}' y='${y - 48}' width='${cell - 8}' height='${(rows.length + 1) * 62 + 20}' rx='10' fill='none' stroke='${C.yellow}' stroke-width='4'/>`;
  return out;
}
const CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
function cnNum(n: number) {
  if (n < 10) return CN[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return (t === 1 ? "十" : CN[t] + "十") + (o ? CN[o] : "");
}
/** 乘法口诀：小数在前 */
function koujue(a: number, b: number) {
  const [s, l] = a <= b ? [a, b] : [b, a];
  const p = s * l;
  return `${CN[s]}${CN[l]}${p < 10 ? "得" : ""}${cnNum(p)}`;
}
function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : String(+n.toFixed(2));
}

// ---------- 题干解析 ----------
function normalize(stem: string) {
  return stem
    .replace(/[（）]/g, (c) => (c === "（" ? "(" : ")"))
    .replace(/[×xX＊*]/g, "×")
    .replace(/[÷/／]/g, (c) => (c === "÷" ? "÷" : "/"))
    .replace(/[－—–]/g, "-")
    .replace(/[＋]/g, "+")
    .replace(/[＝]/g, "=")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/^(口算|计算|算一算|填空|直接写出得数)[:：]\s*/, "")
    .replace(/_+|。|\?|？/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function templateExplanation(stem: string): TemplateExplanation | null {
  const s = normalize(stem);
  let m: RegExpMatchArray | null;

  if ((m = s.match(/^(\d+) × (\d+) ([+-]) (\d+) =/)) || (m = s.match(/^(\d+)×(\d+)([+-])(\d+)=/))) return mixedMul(+m[1], +m[2], m[3] as "+" | "-", +m[4], false);
  if ((m = s.match(/^(\d+) ([+-]) (\d+) × (\d+) =/)) || (m = s.match(/^(\d+)([+-])(\d+)×(\d+)=/))) return mixedMul(+m[3], +m[4], m[2] as "+" | "-", +m[1], true);
  if ((m = s.match(/^(\d+)\/(\d+) ([+-]) (\d+)\/(\d+) =/)) || (m = s.match(/^(\d+)\/(\d+)([+-])(\d+)\/(\d+)=/))) {
    if (m[2] === m[5]) return fraction(+m[1], +m[4], +m[2], m[3] as "+" | "-");
    return null;
  }
  if ((m = s.match(/^(\d+) ?(米|千克|元|时|分米|厘米) ?= ?\( ?\) ?(厘米|克|角|分|毫米)/))) return unit(+m[1], m[2], m[3]);
  if ((m = s.match(/^(\d+(?:\.\d+)?) ?([+\-×÷]) ?(\d+(?:\.\d+)?) ?=/))) {
    const a = +m[1], b = +m[3], op = m[2];
    const dec = m[1].includes(".") || m[3].includes(".");
    if (op === "+") return dec ? decAdd(a, b, "+") : add(a, b);
    if (op === "-") return dec ? decAdd(a, b, "-") : sub(a, b);
    if (op === "×") return dec ? null : mul(a, b);
    if (op === "÷") return dec ? null : div(a, b);
  }
  return null;
}

// ---------- 各题型 ----------
function add(a: number, b: number): TemplateExplanation | null {
  if (a + b > 99999) return null;
  const ans = a + b;
  const quiz = { question: `${a + 1} + ${b} = ?`, answer: String(a + b + 1) };
  // 20 以内进位：凑十法
  if (a <= 10 && b <= 10 && ans > 10 && ans <= 20) {
    const [big, small] = a >= b ? [a, b] : [b, a];
    const need = 10 - big;
    const rest = small - need;
    const stepsSvg = (phase: number) =>
      svg(
        title(`${a} + ${b} = ?`) +
          text(120, 130, `${big}`, 40, C.blue) +
          dots(big, 160, 105, C.blue, 30, 8, 10) +
          text(120, 230, `${small}`, 40, C.orange) +
          dots(phase >= 1 ? need : small, 160, 205, phase >= 2 ? C.blue : C.orange, 30, 8, 10) +
          (phase >= 1 ? dots(rest, 160 + need * 38 + 40, 205, C.orange, 30, 8, 10) : "") +
          (phase >= 1 ? text(160 + need * 19, 290, `${need}`, 30, C.green) + text(160 + need * 38 + 40 + rest * 19, 290, `${rest}`, 30, C.orange) : "") +
          (phase >= 2 ? text(W / 2, 370, `${big} + ${need} = 10`, 40, C.green, "middle", "bold") : "") +
          (phase >= 3 ? text(W / 2, 420, `10 + ${rest} = ${ans}`, 40, C.red, "middle", "bold") : ""),
      );
    return {
      title: `${a} + ${b}：凑十法`,
      steps: [
        { caption: "先看大数，想它差几凑成 10", narration: `${big} 差 ${need} 就凑成 10 了。我们把 ${small} 拆开来帮它凑十。`, svg: stepsSvg(0) },
        { caption: `把 ${small} 拆成 ${need} 和 ${rest}`, narration: `${small} 可以拆成 ${need} 和 ${rest}。先把 ${need} 送给 ${big}。`, svg: stepsSvg(1) },
        { caption: `${big} + ${need} = 10`, narration: `${big} 加 ${need} 正好是 10，一整排满了！`, svg: stepsSvg(2) },
        { caption: `10 + ${rest} = ${ans}`, narration: `再加上剩下的 ${rest}，10 加 ${rest} 等于 ${ans}。所以 ${a} 加 ${b} 等于几？大声说出来！`, svg: stepsSvg(3) },
      ],
      summary: "凑十法：大数差几凑十，就从小数里拆出几，先凑成 10 再加剩下的。",
      quiz,
    };
  }
  // 10 以内：数一数
  if (ans <= 10) {
    const mk = (phase: number) =>
      svg(
        title(`${a} + ${b} = ?`) +
          dots(a, 200, 150, C.blue, 44, 12, 10) +
          (phase >= 1 ? dots(b, 200 + a * 56, 150, C.orange, 44, 12, 10) : "") +
          text(200 + (a * 56) / 2, 250, `${a}`, 36, C.blue) +
          (phase >= 1 ? text(200 + a * 56 + (b * 56) / 2, 250, `${b}`, 36, C.orange) : "") +
          (phase >= 2 ? text(W / 2, 360, `一共 ${ans} 个`, 44, C.green, "middle", "bold") : ""),
      );
    return {
      title: `${a} + ${b}：合起来数一数`,
      steps: [
        { caption: `先摆 ${a} 个`, narration: `先摆 ${a} 个蓝色的圆片。`, svg: mk(0) },
        { caption: `再摆 ${b} 个`, narration: `再摆 ${b} 个橙色的圆片，放在后面。`, svg: mk(1) },
        { caption: "合起来数一数", narration: `把它们合起来数一数：1、2、3……一共有 ${ans} 个。所以 ${a} 加 ${b} 等于 ${ans}。`, svg: mk(2) },
      ],
      summary: "加法就是把两部分合起来，数一数一共有多少。",
      quiz,
    };
  }
  // 竖式
  return columnAdd(a, b);
}

function columnAdd(a: number, b: number): TemplateExplanation {
  const A = String(a), B = String(b);
  const ans = String(a + b);
  const len = Math.max(A.length, B.length, ans.length);
  const pa = A.padStart(len, " "), pb = B.padStart(len, " ");
  const steps: ExplanationStep[] = [];
  const names = ["个位", "十位", "百位", "千位", "万位"];
  const x = 300, y = 170;
  const carries: { pos: number; v: string; color: string }[] = [];
  steps.push({
    caption: "列竖式，数位对齐",
    narration: `先把 ${a} 和 ${b} 写成竖式，个位对个位，十位对十位，从个位开始算。`,
    svg: svg(title(`${a} + ${b} = ?`) + column([{ s: A }, { s: B }], "+", x, y)),
  });
  let carry = 0;
  let partial = "";
  for (let i = len - 1; i >= 0; i--) {
    const da = +(pa[i] === " " ? 0 : pa[i]);
    const db = +(pb[i] === " " ? 0 : pb[i]);
    const sum = da + db + carry;
    const digit = sum % 10;
    const newCarry = Math.floor(sum / 10);
    partial = String(digit) + partial;
    const place = names[len - 1 - i];
    let narr = `${place}：${da} 加 ${db}${carry ? ` 再加进上来的 ${carry}` : ""} 等于 ${sum}`;
    if (newCarry) {
      narr += `，满十了！${place}写 ${digit}，向${names[len - i] ?? "前一位"}进 1。`;
      carries.push({ pos: i - 1, v: "1", color: C.red });
    } else narr += `，${place}写 ${digit}。`;
    steps.push({
      caption: `${place}：${da} + ${db}${carry ? ` + ${carry}` : ""} = ${sum}`,
      narration: narr,
      svg: svg(title(`${a} + ${b} = ?`) + column([{ s: A }, { s: B }], "+", x, y, [...carries], partial.padStart(len, " ").trimStart(), i) + (newCarry ? text(W / 2, 400, `满十进一：向${names[len - i] ?? "前一位"}进 1`, 30, C.red) : "")),
    });
    carry = newCarry;
  }
  if (carry) {
    partial = String(carry) + partial;
    steps.push({ caption: `最高位进上来 ${carry}`, narration: `最前面还有进上来的 1，直接写在最前面。`, svg: svg(title(`${a} + ${b} = ?`) + column([{ s: A }, { s: B }], "+", x, y, carries, partial)) });
  }
  steps.push({
    caption: `${a} + ${b} = ${ans}`,
    narration: `从个位一位一位加上来，答案就是 ${ans}。你也来说一遍：${a} 加 ${b} 等于多少？`,
    svg: svg(title(`${a} + ${b} = ${ans}`) + column([{ s: A }, { s: B }], "+", x, y, carries, ans) + text(W / 2, 420, `答案：${ans}`, 40, C.green, "middle", "bold")),
  });
  return { title: `${a} + ${b}：竖式计算`, steps, summary: "竖式加法：数位对齐，从个位加起，满十向前一位进一。", quiz: { question: `${a + 11} + ${b} = ?`, answer: String(a + b + 11) } };
}

function sub(a: number, b: number): TemplateExplanation | null {
  if (a < b || a > 99999) return null;
  const ans = a - b;
  const quiz = { question: `${a + 1} - ${b} = ?`, answer: String(ans + 1) };
  // 20 以内退位：破十法
  if (a > 10 && a <= 20 && b < 10 && a % 10 < b) {
    const ones = a - 10;
    const mk = (phase: number) =>
      svg(
        title(`${a} - ${b} = ?`) +
          text(120, 130, "10", 36, C.blue) + dots(10, 170, 105, phase >= 2 ? C.gray : C.blue, 30, 8, 10) +
          text(120, 220, `${ones}`, 36, C.orange) + dots(ones, 170, 195, C.orange, 30, 8, 10) +
          (phase >= 1 ? text(W / 2, 300, `${a} 分成 10 和 ${ones}`, 32, "#1f2937") : "") +
          (phase >= 2 ? `<line x1='170' y1='120' x2='${170 + 10 * 38}' y2='120' stroke='${C.red}' stroke-width='6'/>` + text(W / 2, 350, `10 - ${b} = ${10 - b}`, 36, C.green, "middle", "bold") : "") +
          (phase >= 3 ? text(W / 2, 410, `${10 - b} + ${ones} = ${ans}`, 40, C.red, "middle", "bold") : ""),
      );
    return {
      title: `${a} - ${b}：破十法`,
      steps: [
        { caption: `${a} 分成 10 和 ${ones}`, narration: `个位上 ${ones} 不够减 ${b}。我们把 ${a} 分成 10 和 ${ones}。`, svg: mk(1) },
        { caption: `先用 10 减 ${b}`, narration: `先用整十的 10 去减 ${b}，10 减 ${b} 等于 ${10 - b}。`, svg: mk(2) },
        { caption: `再加上 ${ones}`, narration: `再把剩下的 ${ones} 加回来，${10 - b} 加 ${ones} 等于 ${ans}。所以 ${a} 减 ${b} 等于多少？`, svg: mk(3) },
      ],
      summary: "破十法：个位不够减，先用 10 去减，再把剩下的个位加回来。",
      quiz,
    };
  }
  if (a <= 10) {
    const mk = (phase: number) =>
      svg(
        title(`${a} - ${b} = ?`) +
          dots(a - (phase >= 1 ? b : 0), 200, 150, C.blue, 44, 12, 10) +
          (phase >= 1 ? dots(b, 200 + (a - b) * 56, 150, C.gray, 44, 12, 10) + `<line x1='${200 + (a - b) * 56}' y1='172' x2='${200 + a * 56 - 12}' y2='172' stroke='${C.red}' stroke-width='6'/>` : "") +
          (phase >= 2 ? text(W / 2, 330, `还剩 ${ans} 个`, 44, C.green, "middle", "bold") : ""),
      );
    return {
      title: `${a} - ${b}：去掉几个`,
      steps: [
        { caption: `一共有 ${a} 个`, narration: `一共有 ${a} 个圆片。`, svg: mk(0) },
        { caption: `去掉 ${b} 个`, narration: `减法就是拿走，我们划掉 ${b} 个。`, svg: mk(1) },
        { caption: `还剩 ${ans} 个`, narration: `数一数剩下的，还有 ${ans} 个。所以 ${a} 减 ${b} 等于 ${ans}。`, svg: mk(2) },
      ],
      summary: "减法就是从总数里去掉一部分，数一数还剩多少。",
      quiz,
    };
  }
  return columnSub(a, b);
}

function columnSub(a: number, b: number): TemplateExplanation {
  const A = String(a), B = String(b);
  const ans = String(a - b);
  const len = A.length;
  const pb = B.padStart(len, " ");
  const names = ["个位", "十位", "百位", "千位", "万位"];
  const x = 300, y = 170;
  const steps: ExplanationStep[] = [];
  steps.push({ caption: "列竖式，数位对齐", narration: `把 ${a} 写在上面，${b} 写在下面，个位对个位。从个位开始减。`, svg: svg(title(`${a} - ${b} = ?`) + column([{ s: A }, { s: B }], "-", x, y)) });
  const digits = A.split("").map(Number);
  let partial = "";
  const marks: { pos: number; v: string; color: string }[] = [];
  for (let i = len - 1; i >= 0; i--) {
    const db = +(pb[i] === " " ? 0 : pb[i]);
    let da = digits[i];
    const place = names[len - 1 - i];
    let narr: string;
    if (da < db) {
      digits[i - 1] -= 1;
      da += 10;
      marks.push({ pos: i, v: "10", color: C.red });
      marks.push({ pos: i - 1, v: "·", color: C.red });
      narr = `${place}：${da - 10} 不够减 ${db}，向${names[len - i]}借 1 当 10，${da} 减 ${db} 等于 ${da - db}。`;
    } else narr = `${place}：${da} 减 ${db} 等于 ${da - db}。`;
    partial = String(da - db) + partial;
    steps.push({ caption: `${place}：${da} - ${db} = ${da - db}`, narration: narr, svg: svg(title(`${a} - ${b} = ?`) + column([{ s: A }, { s: B }], "-", x, y, [...marks], partial.replace(/^0+(?=\d)/, "").padStart(len, " ").trimStart(), i)) });
  }
  steps.push({ caption: `${a} - ${b} = ${ans}`, narration: `一位一位减下来，答案是 ${ans}。记住：不够减就向前一位借 1 当 10。`, svg: svg(title(`${a} - ${b} = ${ans}`) + column([{ s: A }, { s: B }], "-", x, y, marks, ans) + text(W / 2, 420, `答案：${ans}`, 40, C.green, "middle", "bold")) });
  return { title: `${a} - ${b}：竖式计算`, steps, summary: "竖式减法：数位对齐，从个位减起，不够减向前一位借一当十。", quiz: { question: `${a + 10} - ${b} = ?`, answer: String(a - b + 10) } };
}

function mul(a: number, b: number): TemplateExplanation | null {
  if (a <= 9 && b <= 9 && a >= 1 && b >= 1) {
    const ans = a * b;
    const mk = (rows: number, showKj: boolean) =>
      svg(
        title(`${a} × ${b} = ?`) +
          Array.from({ length: rows }, (_, r) => dots(b, 260, 100 + r * 34, r === rows - 1 ? C.orange : C.blue, 26, 8, 12) + text(230, 122 + r * 34, `${(r + 1) * b}`, 24, C.gray, "end")).join("") +
          text(W / 2, 100 + a * 34 + 30, `每行 ${b} 个，${rows} 行`, 30, "#1f2937") +
          (showKj ? text(W / 2, 410, `口诀：${koujue(a, b)}`, 40, C.green, "middle", "bold") : ""),
      );
    return {
      title: `${a} × ${b}：${koujue(a, b)}`,
      steps: [
        { caption: `每行摆 ${b} 个`, narration: `${a} 乘 ${b}，就是 ${a} 个 ${b} 相加。我们每行摆 ${b} 个圆片。`, svg: mk(1, false) },
        { caption: `摆 ${a} 行`, narration: `一共摆 ${a} 行。一行一行数：${Array.from({ length: a }, (_, i) => (i + 1) * b).join("、")}。`, svg: mk(a, false) },
        { caption: `口诀：${koujue(a, b)}`, narration: `用乘法口诀更快：${koujue(a, b)}。所以 ${a} 乘 ${b} 等于 ${ans}。`, svg: mk(a, true) },
      ],
      summary: `${a} 乘 ${b} 就是 ${a} 个 ${b} 相加，记口诀"${koujue(a, b)}"。`,
      quiz: { question: `${a} × ${b === 9 ? b - 1 : b + 1} = ?`, answer: String(a * (b === 9 ? b - 1 : b + 1)) },
    };
  }
  // 多位数 × 一位数：拆成整十和几
  const [big, small] = a >= b ? [a, b] : [b, a];
  if (small <= 9 && big <= 999) {
    const tens = big - (big % 10);
    const ones = big % 10;
    const ans = big * small;
    const mk = (phase: number) =>
      svg(
        title(`${big} × ${small} = ?`) +
          text(W / 2, 130, `${big} = ${tens} + ${ones}`, 38, C.blue) +
          (phase >= 1 ? text(W / 2, 210, `${tens} × ${small} = ${tens * small}`, 38, C.orange) : "") +
          (phase >= 2 ? text(W / 2, 280, `${ones} × ${small} = ${ones * small}`, 38, C.orange) : "") +
          (phase >= 3 ? text(W / 2, 370, `${tens * small} + ${ones * small} = ${ans}`, 44, C.green, "middle", "bold") : ""),
      );
    return {
      title: `${big} × ${small}：拆开算`,
      steps: [
        { caption: `把 ${big} 拆成 ${tens} 和 ${ones}`, narration: `${big} 可以拆成 ${tens} 和 ${ones}，分别去乘 ${small}。`, svg: mk(0) },
        { caption: `${tens} × ${small} = ${tens * small}`, narration: `先算整十的：${tens / 10} 乘 ${small} 等于 ${(tens / 10) * small}，所以 ${tens} 乘 ${small} 等于 ${tens * small}。`, svg: mk(1) },
        { caption: `${ones} × ${small} = ${ones * small}`, narration: `再算 ${ones} 乘 ${small}，口诀 ${koujue(ones || 1, small)}${ones ? "" : "，0 乘任何数都是 0"}。`, svg: mk(2) },
        { caption: `合起来 ${ans}`, narration: `两部分合起来，${tens * small} 加 ${ones * small} 等于 ${ans}。`, svg: mk(3) },
      ],
      summary: "多位数乘一位数：把大数拆成整十（整百）和几，分别乘，再相加。",
      quiz: { question: `${big + 1} × ${small} = ?`, answer: String((big + 1) * small) },
    };
  }
  return null;
}

function div(a: number, b: number): TemplateExplanation | null {
  if (b < 1 || b > 9 || a > 90) return null;
  const q = Math.floor(a / b);
  const r = a % b;
  const groupW = b * 34 + 20;
  const perRow = Math.max(1, Math.floor(720 / groupW));
  const mk = (groups: number, showRem: boolean) => {
    let g = "";
    for (let i = 0; i < groups; i++) {
      const gx = 40 + (i % perRow) * groupW;
      const gy = 100 + Math.floor(i / perRow) * 60;
      g += `<rect x='${gx - 6}' y='${gy - 6}' width='${b * 34 + 4}' height='40' rx='10' fill='none' stroke='${C.green}' stroke-width='3'/>` + dots(b, gx, gy, C.blue, 26, 8, b);
    }
    const remX = 40 + (groups % perRow) * groupW;
    const remY = 100 + Math.floor(groups / perRow) * 60;
    if (showRem && r) g += dots(r, remX, remY, C.orange, 26, 8, r);
    const left = a - groups * b - (showRem ? r : 0);
    if (left > 0) g += dots(left, remX + (showRem ? r * 34 : 0), remY, C.gray, 26, 8, 20);
    return svg(title(`${a} ÷ ${b} = ?`) + g + text(W / 2, 400, groups === q ? `分成了 ${q} 组${r ? `，还剩 ${r} 个` : "，正好分完"}` : `每 ${b} 个一组，圈了 ${groups} 组`, 32, "#1f2937"));
  };
  const steps: ExplanationStep[] = [
    { caption: `一共 ${a} 个，每 ${b} 个一份`, narration: `除法就是平均分。一共 ${a} 个圆片，每 ${b} 个圈成一组，看能圈几组。`, svg: mk(0, false) },
    { caption: "圈一圈", narration: `${b} 个一组，${b} 个一组……一组一组圈起来。`, svg: mk(Math.min(q, 2), false) },
    { caption: `圈了 ${q} 组`, narration: `圈完了，一共 ${q} 组${r ? `，还剩下 ${r} 个，不够再圈一组` : "，正好分完"}。`, svg: mk(q, true) },
  ];
  const ansText = r ? `${q}……${r}` : String(q);
  steps.push({
    caption: `${a} ÷ ${b} = ${ansText}`,
    narration: r
      ? `所以 ${a} 除以 ${b} 等于 ${q} 余 ${r}。记住：余数一定比除数 ${b} 小。也可以用口诀想：${koujue(b, q)}，${a} 减 ${q * b} 剩 ${r}。`
      : `所以 ${a} 除以 ${b} 等于 ${q}。也可以想口诀：${koujue(b, q)}，${b} 乘几等于 ${a}，几就是答案。`,
    svg: svg(title(`${a} ÷ ${b} = ${ansText}`) + text(W / 2, 200, `${b} × ${q} = ${q * b}${r ? `，${a} - ${q * b} = ${r}` : ""}`, 40, C.blue) + text(W / 2, 300, `口诀：${koujue(b, q || 1)}`, 36, C.green) + text(W / 2, 400, `答案：${ansText}`, 44, C.red, "middle", "bold")),
  });
  return { title: `${a} ÷ ${b}：平均分`, steps, summary: r ? "有余数的除法：分到不能再分为止，剩下的就是余数，余数要比除数小。" : "除法就是平均分，想乘法口诀：除数乘几等于被除数。", quiz: { question: `${a + b} ÷ ${b} = ?`, answer: r ? `${q + 1}……${r}` : String(q + 1) } };
}

function mixedMul(a: number, b: number, op: "+" | "-", c: number, reversed: boolean): TemplateExplanation | null {
  const prod = a * b;
  const expr = reversed ? `${c} ${op} ${a} × ${b}` : `${a} × ${b} ${op} ${c}`;
  const ans = reversed ? (op === "+" ? c + prod : c - prod) : op === "+" ? prod + c : prod - c;
  if (ans < 0) return null;
  const second = reversed ? `${c} ${op} ${prod}` : `${prod} ${op} ${c}`;
  const mk = (phase: number) =>
    svg(
      title(`${expr} = ?`) +
        text(W / 2, 150, expr, 48, "#1f2937") +
        (phase >= 1 ? `<rect x='${reversed ? 430 : 250}' y='110' width='170' height='56' rx='12' fill='none' stroke='${C.yellow}' stroke-width='5'/>` + text(W / 2, 230, `先算乘法：${a} × ${b} = ${prod}`, 34, C.orange) : "") +
        (phase >= 2 ? text(W / 2, 310, `再算：${second} = ${ans}`, 34, C.blue) : "") +
        (phase >= 3 ? text(W / 2, 400, `${expr} = ${ans}`, 44, C.green, "middle", "bold") : ""),
    );
  return {
    title: `${expr}：先乘后${op === "+" ? "加" : "减"}`,
    steps: [
      { caption: "看清算式里有乘也有" + (op === "+" ? "加" : "减"), narration: `这个算式里既有乘法又有${op === "+" ? "加" : "减"}法。规则是：先算乘法，再算${op === "+" ? "加" : "减"}法。`, svg: mk(0) },
      { caption: `先算 ${a} × ${b} = ${prod}`, narration: `先把乘法算出来，${koujue(a, b)}，${a} 乘 ${b} 等于 ${prod}。`, svg: mk(1) },
      { caption: `再算 ${second}`, narration: `把 ${prod} 放回算式，${second} 等于 ${ans}。`, svg: mk(2) },
      { caption: `${expr} = ${ans}`, narration: `所以答案是 ${ans}。记住口诀：先乘除，后加减。`, svg: mk(3) },
    ],
    summary: "有乘有加减的算式，先算乘法，再算加减。",
    quiz: { question: `${a} × ${b} ${op} ${c + 1} = ?`, answer: String(op === "+" ? prod + c + 1 : reversed ? c + 1 - prod : prod - c - 1) },
  };
}

function decAdd(a: number, b: number, op: "+" | "-"): TemplateExplanation | null {
  const ans = op === "+" ? a + b : a - b;
  if (ans < 0) return null;
  const A = a.toFixed(1), B = b.toFixed(1), R = ans.toFixed(1);
  const mk = (phase: number) =>
    svg(
      title(`${fmt(a)} ${op} ${fmt(b)} = ?`) +
        text(420, 160, A, 52, "#1f2937", "end") +
        text(420, 230, B, 52, "#1f2937", "end") +
        text(300, 230, op, 52, C.blue) +
        `<line x1='280' y1='250' x2='440' y2='250' stroke='#1f2937' stroke-width='3'/>` +
        (phase >= 1 ? `<line x1='${420 - 26}' y1='110' x2='${420 - 26}' y2='330' stroke='${C.red}' stroke-width='3' stroke-dasharray='8 6'/>` + text(560, 200, "小数点对齐", 30, C.red, "start") : "") +
        (phase >= 2 ? text(420, 310, R, 52, C.green, "end", "bold") : "") +
        (phase >= 3 ? text(W / 2, 400, `${fmt(a)} ${op} ${fmt(b)} = ${fmt(ans)}`, 40, C.green, "middle", "bold") : ""),
    );
  return {
    title: `小数${op === "+" ? "加" : "减"}法：小数点对齐`,
    steps: [
      { caption: "列竖式", narration: `小数${op === "+" ? "加" : "减"}法也用竖式算。`, svg: mk(0) },
      { caption: "小数点对齐", narration: "最关键的一步：小数点要上下对齐，这样相同的数位才对齐。", svg: mk(1) },
      { caption: "按整数方法算", narration: `然后就像整数一样从右边算起，${op === "+" ? "满十进一" : "不够减借一"}，最后在结果里点上小数点。`, svg: mk(2) },
      { caption: `答案 ${fmt(ans)}`, narration: `${fmt(a)} ${op === "+" ? "加" : "减"} ${fmt(b)} 等于 ${fmt(ans)}。`, svg: mk(3) },
    ],
    summary: "小数加减：小数点对齐，按整数方法计算，结果对齐点上小数点。",
    quiz: { question: `${fmt(a + 1)} ${op} ${fmt(b)} = ?`, answer: fmt(ans + 1) },
  };
}

function fraction(a: number, b: number, d: number, op: "+" | "-"): TemplateExplanation | null {
  const n = op === "+" ? a + b : a - b;
  if (n < 0 || n > d || d > 16) return null;
  const barX = 100, barW = 600, cell = barW / d;
  const bar = (fillA: number, fillB: number, colorB: string) => {
    let o = "";
    for (let i = 0; i < d; i++) {
      const fill = i < fillA ? C.blue : i < fillA + fillB ? colorB : "#f3f4f6";
      o += `<rect x='${barX + i * cell}' y='170' width='${cell}' height='90' fill='${fill}' stroke='#fff' stroke-width='3'/>`;
    }
    return o;
  };
  const mk = (phase: number) =>
    svg(
      title(`${a}/${d} ${op} ${b}/${d} = ?`) +
        text(W / 2, 130, `一条平均分成 ${d} 份，每份是 1/${d}`, 30, "#1f2937") +
        (op === "+" ? bar(a, phase >= 1 ? b : 0, C.orange) : bar(a - (phase >= 1 ? b : 0), phase >= 1 ? b : 0, C.gray)) +
        (phase >= 1 && op === "-" ? `<line x1='${barX + (a - b) * cell}' y1='215' x2='${barX + a * cell}' y2='215' stroke='${C.red}' stroke-width='8'/>` : "") +
        (phase >= 2 ? text(W / 2, 330, `${op === "+" ? "一共" : "还剩"} ${n} 份，就是 ${n}/${d}`, 36, C.green, "middle", "bold") : "") +
        (phase >= 3 ? text(W / 2, 410, `${a}/${d} ${op} ${b}/${d} = ${n}/${d}`, 40, C.red, "middle", "bold") : ""),
    );
  return {
    title: `同分母分数${op === "+" ? "加" : "减"}法`,
    steps: [
      { caption: `先涂 ${a} 份`, narration: `把一条平均分成 ${d} 份，${a}/${d} 就是其中的 ${a} 份，涂成蓝色。`, svg: mk(0) },
      { caption: op === "+" ? `再涂 ${b} 份` : `去掉 ${b} 份`, narration: op === "+" ? `再涂 ${b} 份橙色，表示加上 ${b}/${d}。` : `减去 ${b}/${d}，就是划掉 ${b} 份。`, svg: mk(1) },
      { caption: `数一数：${n} 份`, narration: `${op === "+" ? "一共涂了" : "还剩"} ${n} 份，每份是 1/${d}，所以是 ${n}/${d}。`, svg: mk(2) },
      { caption: `分母不变，分子${op === "+" ? "相加" : "相减"}`, narration: `分母 ${d} 不变，分子 ${a} ${op === "+" ? "加" : "减"} ${b} 等于 ${n}。答案是 ${n}/${d}。`, svg: mk(3) },
    ],
    summary: `同分母分数${op === "+" ? "加" : "减"}法：分母不变，分子${op === "+" ? "相加" : "相减"}。`,
    quiz: { question: `${a}/${d} ${op} ${Math.max(1, b - 1)}/${d} = ?`, answer: `${op === "+" ? a + Math.max(1, b - 1) : a - Math.max(1, b - 1)}/${d}` },
  };
}

function unit(k: number, from: string, to: string): TemplateExplanation | null {
  const rate: Record<string, number> = { "米厘米": 100, "千克克": 1000, "元角": 10, "时分": 60, "分米厘米": 10, "厘米毫米": 10, "米分米": 10 };
  const r = rate[from + to];
  if (!r) return null;
  const ans = k * r;
  const mk = (phase: number) =>
    svg(
      title(`${k} ${from} = ( ) ${to}`) +
        text(W / 2, 140, `1 ${from} = ${r} ${to}`, 44, C.blue, "middle", "bold") +
        Array.from({ length: Math.min(k, 6) }, (_, i) => `<rect x='${100 + i * 100}' y='190' width='90' height='50' rx='10' fill='${phase >= 1 ? C.light : "#f3f4f6"}' stroke='${C.orange}' stroke-width='3'/>` + text(145 + i * 100, 225, phase >= 1 ? `${r}` : `1${from}`, 26, "#1f2937")).join("") +
        (k > 6 ? text(720, 225, "…", 30, C.gray) : "") +
        (phase >= 2 ? text(W / 2, 320, `${k} 个 ${r}：${k} × ${r} = ${ans}`, 36, C.green, "middle", "bold") : "") +
        (phase >= 3 ? text(W / 2, 400, `${k} ${from} = ${ans} ${to}`, 42, C.red, "middle", "bold") : ""),
    );
  return {
    title: `${from}和${to}的换算`,
    steps: [
      { caption: `记住：1 ${from} = ${r} ${to}`, narration: `先想单位之间的关系：1 ${from} 等于 ${r} ${to}。`, svg: mk(0) },
      { caption: `${k} ${from} 就是 ${k} 个 ${r} ${to}`, narration: `${k} ${from} 就是 ${k} 个 1 ${from}，每个都是 ${r} ${to}。`, svg: mk(1) },
      { caption: `${k} × ${r} = ${ans}`, narration: `${k} 个 ${r} 就是 ${k} 乘 ${r}，等于 ${ans}。`, svg: mk(2) },
      { caption: `${k} ${from} = ${ans} ${to}`, narration: `所以 ${k} ${from} 等于 ${ans} ${to}。大单位换小单位，乘进率。`, svg: mk(3) },
    ],
    summary: `大单位换小单位，用乘法：1 ${from} = ${r} ${to}。`,
    quiz: { question: `${k + 1} ${from} = ( ) ${to}`, answer: String((k + 1) * r) },
  };
}
