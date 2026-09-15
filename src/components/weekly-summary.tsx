"use client";

import { useState } from "react";

export function WeeklySummary({ childId }: { childId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <section className="card bg-blue-50 border-blue-100">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">🧑‍🏫 AI 老师本周点评</h2>
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              const r = await fetch("/api/report/summary", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ childId }) });
              const j = (await r.json()) as { text?: string; error?: string };
              if (!r.ok || !j.text) throw new Error(j.error ?? "生成失败");
              setText(j.text);
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "正在写点评…" : text ? "重新生成" : "生成点评"}
        </button>
      </div>
      {text && <p className="mt-3 whitespace-pre-wrap leading-relaxed text-sm">{text}</p>}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      {!text && !err && <p className="mt-2 text-xs text-gray-500">根据本周作答、错题、掌握度数据，让 AI 写一段 200 字的点评和下周建议。</p>}
    </section>
  );
}
