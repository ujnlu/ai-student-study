"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STAGES = [["gaokao", "高考"], ["zhongkao", "中考"], ["other", "其他"]] as const;
const SUBJECTS = [["math", "数学"], ["chinese", "语文"], ["english", "英语"], ["physics", "物理"], ["chemistry", "化学"], ["biology", "生物"], ["history", "历史"], ["geography", "地理"], ["politics", "政治"]] as const;

export function PaperUploader() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"file" | "text">("file");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData(e.currentTarget);
      const r = await fetch("/api/papers", { method: "POST", body: fd });
      const j = (await r.json()) as { id?: string; error?: string };
      if (!r.ok || !j.id) throw new Error(j.error ?? "上传失败");
      router.push(`/parent/papers/${j.id}`);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">试卷名称</span><input name="title" className="input" placeholder="如：2025 年全国甲卷 数学" required /></label>
        <label className="block"><span className="label">年份（可选）</span><input name="year" type="number" className="input" placeholder="2025" /></label>
        <label className="block"><span className="label">考试</span><select name="stage" className="input">{STAGES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
        <label className="block"><span className="label">科目</span><select name="subject" className="input">{SUBJECTS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
        <label className="block"><span className="label">做卷时长（分钟）</span><input name="minutes" type="number" className="input" defaultValue={90} min={10} max={180} /></label>
      </div>
      <div className="flex gap-2 text-sm">
        <button type="button" className={mode === "file" ? "chip-on" : "chip"} onClick={() => setMode("file")}>📎 上传 PDF / 图片</button>
        <button type="button" className={mode === "text" ? "chip-on" : "chip"} onClick={() => setMode("text")}>📝 粘贴文本</button>
      </div>
      {mode === "file" ? (
        <label className="block">
          <span className="label">文件（可多选；PDF 需有文字层，扫描件请传图片；答案页一起传效果最好）</span>
          <input name="files" type="file" multiple accept="application/pdf,image/*,.txt,.md" className="input" />
        </label>
      ) : (
        <label className="block">
          <span className="label">试卷文本（连答案一起贴进来，AI 会自动配对）</span>
          <textarea name="text" rows={10} className="input font-mono text-sm" placeholder="1. 已知集合 A=……&#10;A. … B. … C. … D. …&#10;……&#10;参考答案：1.B 2.C ……" />
        </label>
      )}
      {err && <p className="text-sm text-berry font-bold">{err}</p>}
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? "上传中…" : "上传并解析"}</button>
      <p className="text-xs text-gray-500">解析在后台进行（一份完整试卷约 2-5 分钟），完成后可整卷限时做题、逐题看解题讲解；解答题对照参考答案自评。</p>
    </form>
  );
}
