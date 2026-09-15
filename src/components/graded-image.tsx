"use client";

import { useState } from "react";

type Mark = { box: { x: number; y: number; w: number; h: number }; ok: boolean; index: number };

/** 原图上叠加 ✓ / ✗ 标记（AI 给出的相对位置） */
export function GradedImage({ src, marks }: { src: string; marks: Mark[] }) {
  const [big, setBig] = useState(false);
  const overlay = (
    <div className="relative inline-block w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="作业" className="w-full rounded-xl border" />
      {marks.map((m) => (
        <div
          key={m.index}
          className={`absolute rounded-md border-2 ${m.ok ? "border-green-500/70" : "border-red-500/80 bg-red-500/10"}`}
          style={{ left: `${m.box.x * 100}%`, top: `${m.box.y * 100}%`, width: `${m.box.w * 100}%`, height: `${m.box.h * 100}%` }}
        >
          <span className={`absolute -top-3 -right-3 w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-bold shadow ${m.ok ? "bg-green-500" : "bg-red-500"}`}>
            {m.ok ? "✓" : "✗"}
          </span>
        </div>
      ))}
    </div>
  );
  return (
    <>
      <button type="button" onClick={() => setBig(true)} className="block w-28 h-28 shrink-0 text-left">
        <div className="relative w-28 h-28 overflow-hidden rounded-xl border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="作业" className="w-full h-full object-cover" />
          {marks.length > 0 && <span className="absolute bottom-1 right-1 badge bg-black/60 text-white text-[10px]">点开看标记</span>}
        </div>
      </button>
      {big && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={() => setBig(false)}>
          <div className="bg-white rounded-2xl p-2 max-w-3xl w-full max-h-[92vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            {overlay}
            <button type="button" className="btn-secondary w-full mt-2" onClick={() => setBig(false)}>关闭</button>
          </div>
        </div>
      )}
    </>
  );
}
