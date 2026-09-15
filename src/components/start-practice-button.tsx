"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function StartPracticeButton({ kind, mistakeId, subjectId, count, timeLimitSec, label, className = "btn-primary" }: { kind: "oral" | "variant" | "review" | "sync"; mistakeId?: string; subjectId?: string; count?: number; timeLimitSec?: number | null; label: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const r = await fetch("/api/practice/create", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ kind, mistakeId, subjectId, count, timeLimitSec }),
            });
            const j = (await r.json()) as { id?: string; error?: string };
            if (!r.ok || !j.id) throw new Error(j.error ?? "失败");
            router.push(`/child/practice/${j.id}`);
          } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
            setBusy(false);
          }
        }}
      >
        {busy ? (kind === "oral" ? "出题中…" : kind === "sync" ? "正在准备今天的同步练…" : "AI 老师出题中，约 20 秒…") : label}
      </button>
      {err && <span className="text-xs text-red-600 mt-1">{err}</span>}
    </span>
  );
}
