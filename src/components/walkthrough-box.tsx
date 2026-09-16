"use client";

import { useState } from "react";

/** 解题讲解：有缓存直接展开，没有则点按钮生成一次 */
export function WalkthroughBox({ problemId, childId, initial, className = "btn-secondary text-xs py-1.5" }: { problemId: string; childId?: string; initial?: string | null; className?: string }) {
  const [text, setText] = useState<string | null>(initial ?? null);
  const [open, setOpen] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (text) {
      setOpen((o) => !o);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/problems/${problemId}/walkthrough`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ childId }) });
      const j = (await r.json()) as { text?: string; error?: string };
      if (!r.ok || !j.text) throw new Error(j.error ?? "生成失败");
      setText(j.text);
      setOpen(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-block w-full">
      <button type="button" className={className} disabled={busy} onClick={load}>{busy ? "老师正在写讲解…" : open ? "收起讲解" : "📝 解题讲解"}</button>
      {err && <p className="text-xs text-berry font-bold mt-1">{err}</p>}
      {open && text && (
        <div className="mt-2 rounded-2xl bg-sky-soft/60 p-3 text-sm font-bold leading-relaxed whitespace-pre-wrap text-left">
          {text.split(/(【[^】]+】)/g).map((seg, i) => (seg.startsWith("【") ? <span key={i} className="text-sky-dark font-black">{seg}</span> : <span key={i}>{seg}</span>))}
        </div>
      )}
    </div>
  );
}
