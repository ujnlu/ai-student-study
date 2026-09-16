"use client";

import { useState } from "react";

/** 查找并打开某一课在国家中小学智慧教育平台的官方课程视频（新窗口） */
export function LessonVideoButton({ chapterId, url, className = "btn-sky text-sm py-2", label = "▶️ 看老师讲课" }: { chapterId: string; url?: string | null; className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (url) {
    return <a href={url} target="_blank" rel="noopener" className={className}>{label}</a>;
  }
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          // 先同步开一个窗口，避免异步之后被浏览器拦截弹窗
          const win = window.open("", "_blank");
          try {
            const r = await fetch("/api/lesson", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chapterId, what: "video" }) });
            const j = (await r.json()) as { url?: string; error?: string };
            if (!r.ok || !j.url) throw new Error(j.error ?? "没找到视频");
            if (win) win.location.href = j.url;
            else window.open(j.url, "_blank");
          } catch (e) {
            win?.close();
            setErr(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "正在找视频…" : label}
      </button>
      {err && <span className="text-xs text-berry mt-1">{err}</span>}
    </span>
  );
}
