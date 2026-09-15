/**
 * 国家中小学智慧教育平台的 X-ND-AUTH 签名头（MAC 方案）。
 * 凭据来自浏览器登录后的 localStorage：{ access_token, mac_key, diff }。
 * 算法与官网前端一致：HMAC-SHA256(mac_key, "nonce\nMETHOD\npath?query\nhost\n") → Base64。
 */
import crypto from "node:crypto";

export type SmarteduCreds = { access_token: string; mac_key: string; diff: number };

/** FamilySetting 里存凭据用的 key */
export const SMARTEDU_TOKEN_KEY = "smartedu_token";

const NONCE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function parseCreds(raw: string | null | undefined): SmarteduCreds | null {
  if (!raw) return null;
  try {
    let data: unknown = JSON.parse(raw.trim());
    if (typeof data === "string") data = JSON.parse(data);
    if (!data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;
    if (typeof d.access_token !== "string" || !d.access_token.trim()) return null;
    if (typeof d.mac_key !== "string" || !d.mac_key.trim()) return null;
    const diff = Number(d.diff ?? 0);
    return { access_token: d.access_token.trim(), mac_key: d.mac_key, diff: Number.isFinite(diff) ? Math.trunc(diff) : 0 };
  } catch {
    return null;
  }
}

function nonce(diff: number) {
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += NONCE_ALPHABET[Math.ceil(35 * Math.random())];
  return `${Date.now() + diff}:${suffix}`;
}

export function ndAuthHeader(url: string, method: string, c: SmarteduCreds): string {
  const u = new URL(url);
  const relative = decodeURIComponent(u.pathname) + (u.search ? u.search : "");
  const n = nonce(c.diff);
  const text = `${n}\n${method.toUpperCase()}\n${relative}\n${u.hostname}\n`;
  const mac = crypto.createHmac("sha256", c.mac_key).update(text, "utf8").digest("base64");
  return `MAC id="${c.access_token}",nonce="${n}",mac="${mac}"`;
}

/** 浏览器控制台里取凭据的脚本（展示给家长复制） */
export const TOKEN_SCRIPT = `(() => {
  const k = Object.keys(localStorage).find(k => /^ND_UC_AUTH-[^&]+&[^&]+&token$/.test(k));
  if (!k) return alert("没找到登录信息，请先在 basic.smartedu.cn 登录");
  const v = JSON.parse(JSON.parse(localStorage.getItem(k)).value);
  const out = JSON.stringify({ access_token: v.access_token, mac_key: v.mac_key, diff: v.diff });
  copy(out); console.log(out); alert("已复制到剪贴板，回到网站粘贴即可");
})();`;
