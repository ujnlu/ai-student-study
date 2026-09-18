"use client";
import { useState } from "react";
/** 查找并打开某一课在国家中小学智慧教育平台的官方课程视频（新窗口）；无视频时不渲染 */
export function LessonVideoButton({ chapterId, url, className = "btn-sky text-sm py-2", label = "▶️ 看老师讲课" }: { chapterId: string; url?: string | null; className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);
  if (url) {
    return <a href={url} target="_blank" rel="noopener" className={className}>{label}</a>;
  }
  if (notFound) return null;
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const win = window.open("", "_blank");
        try {
          const r = await fetch("/api/lesson", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chapterId, what: "video" }) });
          const j = (await r.json()) as { url?: string; error?: string };
          if (!r.ok || !j.url) {
            win?.close();
            setNotFound(true);
            return;
          }
          if (win) win.location.href = j.url;
          else window.open(j.url, "_blank");
        } catch {
          win?.close();
          setNotFound(true);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "正在找视频…" : label}
    </button>
  );
}
