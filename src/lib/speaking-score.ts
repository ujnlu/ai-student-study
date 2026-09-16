/** 英语跟读打分（纯函数，客户端也会用） */
export type WordDiff = { w: string; ok: boolean };

/** 按单词比对（大小写、标点无关），返回准确率与逐词标记 */
export function scoreSpeech(expected: string, transcript: string): { accuracy: number; diff: WordDiff[] } {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  const a = norm(expected);
  const b = norm(transcript);
  const words = expected.split(/\s+/).filter(Boolean);
  if (a.length === 0) return { accuracy: 0, diff: [] };
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ok = new Array<boolean>(n).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ok[i] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const matched = ok.filter(Boolean).length;
  // 原句里的标点单独成词时（如 "?"）不计入
  const diff: WordDiff[] = [];
  let k = 0;
  for (const w of words) {
    const has = /[a-z0-9]/i.test(w);
    diff.push({ w, ok: has ? (ok[k] ?? false) : true });
    if (has) k++;
  }
  return { accuracy: Math.round((matched / n) * 100), diff };
}

