"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSfx } from "@/components/fx";

const SUBJECTS = [
  { id: "math", name: "数学", icon: "🧮" },
  { id: "chinese", name: "语文", icon: "📖" },
  { id: "english", name: "英语", icon: "🔤" },
];

/** 「问橙橙」提问表单：打字或拍照，选学科，提交后跳到答疑对话 */
export function AskForm({ defaultSubject = "math" }: { defaultSubject?: string }) {
  const router = useRouter();
  const play = useSfx();
  const [subject, setSubject] = useState(defaultSubject);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
  }

  function clearPhoto() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    if (cameraRef.current) cameraRef.current.value = "";
  }

  async function submit() {
    const t = text.trim();
    if (!t && !file) {
      setError("先把题目打出来，或者拍一张照片吧");
      return;
    }
    play("tap");
    setBusy(file ? "橙橙正在看题目…" : "橙橙正在准备…");
    setError(null);
    try {
      let res: Response;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("subjectId", subject);
        if (t) fd.append("text", t);
        res = await fetch("/api/ask", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: t, subjectId: subject }),
        });
      }
      const json = (await res.json()) as { conversationId?: string; error?: string };
      if (!res.ok || !json.conversationId) throw new Error(json.error ?? "出了点小问题，再试一次吧");
      router.push(`/child/ask/${json.conversationId}`);
    } catch (e) {
      play("wrong");
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex gap-2 flex-wrap">
        {SUBJECTS.map((s) => (
          <button key={s.id} type="button" onClick={() => setSubject(s.id)} className={subject === s.id ? "chip-on" : "chip"} disabled={!!busy}>
            {s.icon} {s.name}
          </button>
        ))}
      </div>

      <textarea
        className="input text-lg min-h-28 resize-y"
        placeholder="把题目打在这里，比如：小明有 12 颗糖，分给 3 个小朋友，每人几颗？"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!!busy}
        maxLength={2000}
      />

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />

      {preview ? (
        <div className="card p-2 relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="题目照片" className="w-full rounded-2xl max-h-[50vh] object-contain" />
          <button type="button" onClick={clearPhoto} className="absolute top-3 right-3 btn-secondary text-xs py-1 px-3" disabled={!!busy}>
            ✕ 换一张
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => cameraRef.current?.click()} disabled={!!busy} className="w-full card border-dashed text-center py-6 font-extrabold text-muted hover:bg-brand-soft/40 active:scale-[0.98] transition-transform">
          📷 拍题 · 把题目拍下来问橙橙
        </button>
      )}

      <button className="btn-primary w-full text-lg py-4" disabled={!!busy || (!text.trim() && !file)}>
        {busy ?? "🙋 问橙橙"}
      </button>
      {error && <p className="text-berry font-bold text-sm text-center">{error}</p>}
    </form>
  );
}
