"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Lesson = { id: string; title: string; unit: string; page: number };

export function ProgressPicker({ subjectId, currentId, lessons, childId }: { subjectId: string; currentId: string | null; lessons: Lesson[]; childId?: string }) {
  const router = useRouter();
  const [cur, setCur] = useState(currentId);
  const [busy, setBusy] = useState(false);
  const units = [...new Set(lessons.map((l) => l.unit))];

  async function pick(id: string) {
    setCur(id);
    setBusy(true);
    await fetch("/api/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subjectId, chapterId: id, childId }) });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {units.map((u) => (
        <div key={u} className="card py-3">
          <p className="font-semibold text-gray-700 mb-2">{u}</p>
          <div className="flex flex-wrap gap-2">
            {lessons
              .filter((l) => l.unit === u)
              .map((l) => (
                <button
                  key={l.id}
                  type="button"
                  disabled={busy}
                  onClick={() => pick(l.id)}
                  className={`px-3 py-2 rounded-xl text-sm border transition ${cur === l.id ? "bg-brand text-white border-brand" : "bg-white border-gray-200 hover:bg-orange-50"}`}
                >
                  {l.title} <span className={`text-xs ${cur === l.id ? "text-orange-100" : "text-gray-400"}`}>p{Math.max(1, l.page)}</span>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
