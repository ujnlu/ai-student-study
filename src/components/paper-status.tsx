"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** 解析进行中时每 5 秒轮询，完成后刷新页面 */
export function PaperStatus({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (status !== "parsing" && status !== "pending") return;
    const t = window.setInterval(async () => {
      const r = await fetch(`/api/papers/${id}`).catch(() => null);
      const j = r ? ((await r.json()) as { status?: string }) : null;
      if (j?.status && j.status !== "parsing" && j.status !== "pending") router.refresh();
    }, 5000);
    return () => window.clearInterval(t);
  }, [id, status, router]);

  async function act(action: "reparse" | "delete") {
    if (action === "delete" && !confirm("删除这份试卷和它的题目？")) return;
    setBusy(true);
    await fetch(`/api/papers/${id}`, { method: action === "delete" ? "DELETE" : "POST", headers: { "content-type": "application/json" }, body: action === "delete" ? undefined : JSON.stringify({ action }) });
    setBusy(false);
    if (action === "delete") router.push("/parent/papers");
    else router.refresh();
  }

  return (
    <span className="flex gap-2 items-center">
      {(status === "parsing" || status === "pending") && <span className="text-sm text-gray-500">⏳ 解析中，页面会自动刷新…</span>}
      <button type="button" className="btn-secondary text-sm" disabled={busy || status === "parsing"} onClick={() => act("reparse")}>重新解析</button>
      <button type="button" className="btn-danger text-sm" disabled={busy} onClick={() => act("delete")}>删除</button>
    </span>
  );
}
