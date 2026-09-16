/** 背诵 / 朗读打分（纯函数，客户端也会用） */
export type DiffChar = { ch: string; ok: boolean };

/** 只保留汉字 / 字母 / 数字，用来比对 */
export function normalize(s: string) {
  return Array.from(s.toLowerCase()).filter((c) => /[一-龥a-z0-9]/.test(c));
}

/**
 * 按字比对：去掉标点空格后做最长公共子序列，
 * accuracy = 匹配上的字数 / 原文字数；diff 按原文（含标点）逐字标记，标点一律 ok。
 */
export function scoreRecitation(expected: string, transcript: string): { accuracy: number; diff: DiffChar[]; matched: number; total: number } {
  const a = normalize(expected);
  const b = normalize(transcript);
  const n = a.length;
  const m = b.length;
  if (n === 0) return { accuracy: 0, diff: [], matched: 0, total: 0 };

  // LCS 表（n、m 都是几百以内，直接二维）
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // 回溯，标记原文里哪些字被背出来了
  const okFlags = new Array<boolean>(n).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      okFlags[i] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const matched = okFlags.filter(Boolean).length;

  const diff: DiffChar[] = [];
  let k = 0;
  for (const ch of Array.from(expected)) {
    if (/[一-龥a-zA-Z0-9]/.test(ch)) {
      diff.push({ ch, ok: okFlags[k] ?? false });
      k++;
    } else diff.push({ ch, ok: true });
  }
  return { accuracy: Math.round((matched / n) * 100), diff, matched, total: n };
}
