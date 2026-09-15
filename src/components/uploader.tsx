"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Subject = { id: string; name: string };

export function Uploader({ childId, subjects, defaultSubject }: { childId: string; subjects: Subject[]; defaultSubject?: string }) {
  const router = useRouter();
  const [subject, setSubject] = useState(defaultSubject ?? subjects[0]?.id ?? "math");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setError(null);
    const url = URL.createObjectURL(f);
    setPreview(url);
  }

  async function submit() {
    if (!file) return;
    setBusy("正在上传…");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("childId", childId);
      fd.append("subjectId", subject);
      fd.append("kind", "homework");
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      const upJson = (await up.json()) as { id?: string; error?: string };
      if (!up.ok || !upJson.id) throw new Error(upJson.error ?? "上传失败");
      setBusy("AI 老师正在批改，通常需要 20-60 秒…");
      const g = await fetch(`/api/uploads/${upJson.id}/grade`, { method: "POST" });
      const gJson = (await g.json()) as { error?: string };
      if (!g.ok) throw new Error(gJson.error ?? "批改失败");
      router.push(`/child/uploads/${upJson.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {subjects.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSubject(s.id)}
            className={`btn ${subject === s.id ? "bg-brand text-white" : "bg-white border border-gray-200"}`}
          >
            {s.name}
          </button>
        ))}
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />

      {preview ? (
        <div className="card p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="预览" className="w-full rounded-xl max-h-[60vh] object-contain" />
        </div>
      ) : (
        <div className="card border-dashed border-2 text-center text-gray-500 py-12">
          把作业平放在桌上，光线亮一点，一页一拍
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn-primary text-lg py-4" onClick={() => cameraRef.current?.click()} disabled={!!busy}>
          📷 拍照
        </button>
        <button type="button" className="btn-secondary text-lg py-4" onClick={() => fileRef.current?.click()} disabled={!!busy}>
          🖼️ 选图片
        </button>
      </div>

      {file && (
        <button type="button" className="btn-primary w-full text-lg py-4" onClick={submit} disabled={!!busy}>
          {busy ?? "✅ 开始批改"}
        </button>
      )}
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
