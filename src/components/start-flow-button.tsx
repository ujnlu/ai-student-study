"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 通用"开始"按钮：POST 一个接口拿到 { id }，然后跳到 redirect 里 {id} 替换后的地址。
 * 例：<StartFlowButton url="/api/pk" redirect="/child/pk/{id}" label="开始 PK" />
 */
export function StartFlowButton({
  url,
  body,
  redirect,
  label,
  busyLabel = "准备中…",
  className = "btn-primary",
}: {
  url: string;
  body?: Record<string, unknown>;
  redirect: string;
  label: string;
  busyLabel?: string;
  className?: string;
}) {
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
            const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
            const j = (await r.json()) as { id?: string; error?: string };
            if (!r.ok || !j.id) throw new Error(j.error ?? "失败了，再试一次");
            router.push(redirect.replace("{id}", j.id));
          } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
            setBusy(false);
          }
        }}
      >
        {busy ? busyLabel : label}
      </button>
      {err && <span className="text-xs text-berry mt-1">{err}</span>}
    </span>
  );
}
