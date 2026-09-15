"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RegradeButton({ uploadId }: { uploadId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        className="btn-secondary text-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await fetch(`/api/uploads/${uploadId}/grade`, { method: "POST" });
          const j = (await r.json()) as { error?: string };
          if (!r.ok) setErr(j.error ?? "失败");
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? "批改中…" : "重新批改"}
      </button>
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
    </div>
  );
}
