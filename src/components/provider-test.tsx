"use client";

import { useState } from "react";

export function ProviderTestButton({ providerId, model }: { providerId: string; model?: string }) {
  const [state, setState] = useState<{ busy: boolean; msg?: string; ok?: boolean }>({ busy: false });
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="btn-secondary text-sm"
        disabled={state.busy}
        onClick={async () => {
          setState({ busy: true });
          try {
            const r = await fetch(`/api/ai/providers/${providerId}/test`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ model }),
            });
            const j = (await r.json()) as { ok: boolean; message: string; latencyMs: number };
            setState({ busy: false, ok: j.ok, msg: `${j.ok ? "✓" : "✗"} ${j.message} (${j.latencyMs}ms)` });
          } catch (e) {
            setState({ busy: false, ok: false, msg: e instanceof Error ? e.message : String(e) });
          }
        }}
      >
        {state.busy ? "测试中…" : "测试连通"}
      </button>
      {state.msg && <span className={`text-xs ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.msg}</span>}
    </span>
  );
}
