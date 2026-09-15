"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function OcrButton({ textbookId, running, progress }: { textbookId: string; running: boolean; progress: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(running);
  const [pct, setPct] = useState(progress);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(async () => {
      const r = await fetch(`/api/textbooks/${textbookId}/status`);
      const j = (await r.json()) as { status: string; progress?: number; error?: string | null };
      setPct(j.progress ?? 0);
      if (j.status !== "ocr") {
        window.clearInterval(t);
        setBusy(false);
        if (j.status === "failed") setErr(j.error ?? "失败");
        router.refresh();
      }
    }, 3000);
    return () => window.clearInterval(t);
  }, [busy, textbookId, router]);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="btn-primary text-xs py-1"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          await fetch(`/api/textbooks/${textbookId}/ocr`, { method: "POST" });
        }}
      >
        {busy ? `AI 识别中 ${pct}%` : "🔍 用 AI 识别文字（按页调用批改助手的视觉模型）"}
      </button>
      {err && <span className="text-red-600">{err}</span>}
    </span>
  );
}
