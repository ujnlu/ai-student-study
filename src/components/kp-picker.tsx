"use client";

import { useMemo, useState } from "react";

export type KpOption = { id: string; name: string; unit: string; grade: number; semester: number; subjectId: string; subjectName: string };

/** 学科 → 年级学期 → 单元/知识点 三级选择，最终提交 knowledgePointId */
export function KpPicker({ kps, defaultSubject = "math", defaultGrade, defaultSemester }: { kps: KpOption[]; defaultSubject?: string; defaultGrade?: number; defaultSemester?: number }) {
  const subjects = useMemo(() => {
    const m = new Map<string, string>();
    for (const k of kps) m.set(k.subjectId, k.subjectName);
    return [...m.entries()];
  }, [kps]);
  const [subject, setSubject] = useState(subjects.some(([id]) => id === defaultSubject) ? defaultSubject : (subjects[0]?.[0] ?? "math"));
  const terms = useMemo(() => {
    const set = new Set<string>();
    for (const k of kps) if (k.subjectId === subject) set.add(`${k.grade}-${k.semester}`);
    return [...set].sort();
  }, [kps, subject]);
  const defaultTerm = defaultGrade ? `${defaultGrade}-${defaultSemester ?? 1}` : terms[terms.length - 1];
  const [term, setTerm] = useState(terms.includes(defaultTerm ?? "") ? defaultTerm! : (terms[0] ?? ""));
  const list = useMemo(() => kps.filter((k) => k.subjectId === subject && `${k.grade}-${k.semester}` === term), [kps, subject, term]);
  const [kpId, setKpId] = useState(list[0]?.id ?? "");
  const effectiveKp = list.some((k) => k.id === kpId) ? kpId : (list[0]?.id ?? "");
  const units = [...new Set(list.map((k) => k.unit))];

  return (
    <>
      <div>
        <label className="label">学科</label>
        <div className="flex gap-2 flex-wrap">
          {subjects.map(([id, name]) => (
            <button key={id} type="button" onClick={() => { setSubject(id); setKpId(""); }} className={id === subject ? "chip-on" : "chip"}>{name}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">年级 · 学期</label>
        <select value={term} onChange={(e) => { setTerm(e.target.value); setKpId(""); }} className="input">
          {terms.map((t) => {
            const [g, s] = t.split("-");
            return <option key={t} value={t}>{g} 年级 {s === "1" ? "上" : "下"}学期</option>;
          })}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">知识点（{list.length} 个）</label>
        <select name="knowledgePointId" value={effectiveKp} onChange={(e) => setKpId(e.target.value)} className="input" required>
          {units.map((u) => (
            <optgroup key={u} label={u}>
              {list.filter((k) => k.unit === u).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
    </>
  );
}
