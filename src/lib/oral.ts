/** 口算题程序化生成：按年级 / 学期规则出题，不依赖 AI */
export type OralItem = { stem: string; answer: string; tag: string };

const r = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

type Gen = () => OralItem;

function addWithin(max: number, carry?: boolean): OralItem {
  let a = r(1, max - 1), b = r(1, max - a);
  if (carry !== undefined && max >= 20) {
    for (let i = 0; i < 20; i++) {
      a = r(1, max - 1); b = r(1, max - a);
      if (((a % 10) + (b % 10) >= 10) === carry) break;
    }
  }
  return { stem: `${a} + ${b} =`, answer: String(a + b), tag: `${max}以内加法` };
}
function subWithin(max: number, borrow?: boolean): OralItem {
  let a = r(2, max), b = r(1, a);
  if (borrow !== undefined && max >= 20) {
    for (let i = 0; i < 20; i++) {
      a = r(11, max); b = r(1, a - 1);
      if ((a % 10 < b % 10) === borrow) break;
    }
  }
  return { stem: `${a} - ${b} =`, answer: String(a - b), tag: `${max}以内减法` };
}
function mulTable(lo = 2, hi = 9): OralItem {
  const a = r(lo, hi), b = r(1, 9);
  return { stem: `${a} × ${b} =`, answer: String(a * b), tag: "表内乘法" };
}
function divTable(lo = 2, hi = 9): OralItem {
  const a = r(lo, hi), b = r(1, 9);
  return { stem: `${a * b} ÷ ${a} =`, answer: String(b), tag: "表内除法" };
}
function divRemainder(): OralItem {
  const d = r(2, 9), q = r(1, 9), rem = r(1, d - 1);
  return { stem: `${d * q + rem} ÷ ${d} =`, answer: `${q}……${rem}`, tag: "有余数的除法" };
}
function mixed2(): OralItem {
  const a = r(2, 9), b = r(2, 9), c = r(1, 20);
  return pick([
    { stem: `${a} × ${b} + ${c} =`, answer: String(a * b + c), tag: "乘加" },
    { stem: `${a * b + c} - ${a} × ${b} =`, answer: String(c), tag: "乘减" },
  ]);
}
function tensAdd(): OralItem {
  const a = r(1, 8) * 10, b = r(1, (90 - a) / 10) * 10;
  return { stem: `${a} + ${b} =`, answer: String(a + b), tag: "整十数加减" };
}
function add3(): OralItem {
  const a = r(100, 899), b = r(100, 999 - a);
  return { stem: `${a} + ${b} =`, answer: String(a + b), tag: "三位数加法" };
}
function sub3(): OralItem {
  const a = r(200, 999), b = r(100, a - 1);
  return { stem: `${a} - ${b} =`, answer: String(a - b), tag: "三位数减法" };
}
function mulMulti1(): OralItem {
  const a = r(12, 99), b = r(2, 9);
  return { stem: `${a} × ${b} =`, answer: String(a * b), tag: "多位数乘一位数" };
}
function divMulti1(): OralItem {
  const b = r(2, 9), q = r(11, 99);
  return { stem: `${b * q} ÷ ${b} =`, answer: String(q), tag: "一位数除多位数" };
}
function mul2x2(): OralItem {
  const a = r(11, 25), b = pick([11, 12, 15, 20, 25, 30]);
  return { stem: `${a} × ${b} =`, answer: String(a * b), tag: "两位数乘两位数" };
}
function mulTens(): OralItem {
  const a = r(12, 99) * 10, b = r(2, 9) * 10;
  return { stem: `${a} × ${b} =`, answer: String(a * b), tag: "整十整百数乘法" };
}
function divTens(): OralItem {
  const b = r(2, 9) * 10, q = r(2, 9);
  return { stem: `${b * q} ÷ ${b} =`, answer: String(q), tag: "除数是整十数" };
}
function smart(): OralItem {
  return pick([
    { stem: `25 × ${r(1, 9)} × 4 =`, answer: "", tag: "简便运算" },
    { stem: `125 × ${r(1, 9)} × 8 =`, answer: "", tag: "简便运算" },
  ]).stem.includes("25 ×") && !pick([true, false])
    ? (() => { const k = r(1, 9); return { stem: `25 × ${k} × 4 =`, answer: String(100 * k), tag: "简便运算" }; })()
    : (() => { const k = r(1, 9); return { stem: `125 × ${k} × 8 =`, answer: String(1000 * k), tag: "简便运算" }; })();
}
function dec1(x: number) { return (x / 10).toFixed(1).replace(/\.0$/, ""); }
function decAdd(): OralItem {
  const a = r(1, 99), b = r(1, 99);
  return { stem: `${dec1(a)} + ${dec1(b)} =`, answer: dec1(a + b), tag: "小数加法" };
}
function decSub(): OralItem {
  const a = r(20, 99), b = r(1, a - 1);
  return { stem: `${dec1(a)} - ${dec1(b)} =`, answer: dec1(a - b), tag: "小数减法" };
}
function decMul(): OralItem {
  const a = r(1, 9), b = r(2, 9);
  return { stem: `${dec1(a)} × ${b} =`, answer: dec1(a * b), tag: "小数乘整数" };
}
function decDiv(): OralItem {
  const b = r(2, 9), q = r(1, 9);
  return { stem: `${dec1(b * q)} ÷ ${b} =`, answer: dec1(q), tag: "小数除以整数" };
}
function fracAdd(): OralItem {
  const d = r(3, 12), a = r(1, d - 2), b = r(1, d - 1 - a);
  return { stem: `${a}/${d} + ${b}/${d} =`, answer: `${a + b}/${d}`, tag: "同分母分数加法" };
}
function fracSub(): OralItem {
  const d = r(3, 12), a = r(2, d - 1), b = r(1, a - 1);
  return { stem: `${a}/${d} - ${b}/${d} =`, answer: `${a - b}/${d}`, tag: "同分母分数减法" };
}
// ---------- 六年级：分数乘除、百分数 ----------
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }
function fracStr(p: number, q: number) {
  const g = gcd(p, q);
  p /= g; q /= g;
  return q === 1 ? String(p) : `${p}/${q}`;
}
/** 分母 q 下随机取一个与它互质的分子，题干里不出现未约分的分数 */
function numer(q: number) {
  for (;;) { const p = r(1, q - 1); if (gcd(p, q) === 1) return p; }
}
function fracMulInt(): OralItem {
  const d = r(3, 9), a = numer(d), n = r(2, 9);
  return { stem: `${a}/${d} × ${n} =`, answer: fracStr(a * n, d), tag: "分数乘整数" };
}
function fracMul(): OralItem {
  const b = r(2, 9), a = numer(b), d = r(2, 9), c = numer(d);
  return { stem: `${a}/${b} × ${c}/${d} =`, answer: fracStr(a * c, b * d), tag: "分数乘分数" };
}
function fracDivInt(): OralItem {
  const b = r(2, 9), a = numer(b), n = r(2, 6);
  return { stem: `${a}/${b} ÷ ${n} =`, answer: fracStr(a, b * n), tag: "分数除以整数" };
}
function fracDiv(): OralItem {
  const b = r(2, 9), a = numer(b), d = r(2, 9), c = numer(d);
  return { stem: `${a}/${b} ÷ ${c}/${d} =`, answer: fracStr(a * d, b * c), tag: "分数除以分数" };
}
function percentOf(): OralItem {
  const n = pick([20, 40, 50, 60, 80, 100, 120, 150, 200, 300, 400, 500]), p = pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80]);
  return { stem: `${n} × ${p}% =`, answer: String((n * p) / 100), tag: "百分数" };
}
function percentConv(): OralItem {
  if (Math.random() < 0.5) {
    const p = pick([5, 12, 25, 40, 50, 65, 75, 80, 95, 120]);
    return { stem: `${p}% 化成小数 =`, answer: String(p / 100), tag: "百分数与小数" };
  }
  const x = pick([0.05, 0.2, 0.25, 0.4, 0.5, 0.75, 0.8, 1.2, 1.5]);
  return { stem: `${x} 化成百分数 =`, answer: `${Math.round(x * 100)}%`, tag: "百分数与小数" };
}

function unitConv(): OralItem {
  return pick([
    (() => { const k = r(1, 9); return { stem: `${k} 米 = ( ) 厘米`, answer: String(k * 100), tag: "单位换算" }; })(),
    (() => { const k = r(1, 9); return { stem: `${k} 千克 = ( ) 克`, answer: String(k * 1000), tag: "单位换算" }; })(),
    (() => { const k = r(1, 9); return { stem: `${k} 元 = ( ) 角`, answer: String(k * 10), tag: "单位换算" }; })(),
    (() => { const k = r(1, 5); return { stem: `${k} 时 = ( ) 分`, answer: String(k * 60), tag: "单位换算" }; })(),
  ]);
}

const RULES: Record<string, Gen[]> = {
  "1-1": [() => addWithin(10), () => subWithin(10)],
  "1-2": [() => addWithin(20, true), () => subWithin(20, true), tensAdd, () => addWithin(20, false)],
  "2-1": [() => addWithin(100, true), () => subWithin(100, true), () => mulTable(2, 6), () => mulTable(7, 9), unitConv],
  "2-2": [() => divTable(2, 9), divRemainder, mixed2, () => mulTable(2, 9), () => subWithin(100, true)],
  "3-1": [add3, sub3, mulMulti1, () => addWithin(100, true), unitConv],
  "3-2": [divMulti1, mul2x2, mulMulti1, mulTens, decAdd],
  "4-1": [mulTens, divTens, mul2x2, smart, add3],
  "4-2": [decAdd, decSub, smart, mulTens, divTens],
  "5-1": [decMul, decDiv, decAdd, decSub, smart],
  "5-2": [fracAdd, fracSub, decMul, decDiv, smart],
  "6-1": [fracMulInt, fracMul, fracDivInt, fracDiv, percentOf],
  "6-2": [percentOf, percentConv, fracDiv, decMul, decDiv, smart],
};

export function generateOral(grade: number, semester: number, count = 20): OralItem[] {
  const key = `${Math.min(6, Math.max(1, grade))}-${semester === 2 ? 2 : 1}`;
  const gens = RULES[key] ?? RULES["1-1"];
  const out: OralItem[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (out.length < count && guard++ < count * 20) {
    const item = gens[out.length % gens.length]();
    if (seen.has(item.stem)) continue;
    seen.add(item.stem);
    out.push(item);
  }
  return out;
}

/** 答案归一化后比较：全角转半角、去空格、余数/分数写法统一、数值相等即可 */
export function answersMatch(given: string | null | undefined, expected: string): boolean {
  const norm = (x: string) =>
    x
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[／]/g, "/")
      .replace(/[．。]/g, ".")
      .replace(/(余|\.{2,}|…+|r)/gi, "……")
      .replace(/\s+/g, "")
      .replace(/[.。．]+$/, "")
      .toLowerCase()
      .trim();
  const g = norm(given ?? ""), e = norm(expected);
  if (!g) return false;
  if (g === e) return true;
  // 数值比较：支持整数/小数、分数（2/4 = 1/2）、百分数（25% = 0.25）
  const toNum = (x: string): number => {
    const m = x.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    if (m) return Number(m[1]) / Number(m[2]);
    if (/^-?\d+(?:\.\d+)?%$/.test(x)) return Number(x.slice(0, -1)) / 100;
    return Number(x);
  };
  const gn = toNum(g), en = toNum(e);
  if (!Number.isNaN(gn) && !Number.isNaN(en) && Number.isFinite(gn)) return Math.abs(gn - en) < 1e-9;
  return false;
}
