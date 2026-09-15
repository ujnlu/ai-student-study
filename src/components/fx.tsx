"use client";

import { useCallback, useEffect, useState } from "react";

/** 答对 / 答错 / 完成 的小音效（WebAudio，不需要素材文件） */
export function useSfx() {
  const play = useCallback((kind: "correct" | "wrong" | "win" | "tap") => {
    if (typeof window === "undefined") return;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const seq: [number, number, number][] =
        kind === "correct" ? [[660, 0, 0.08], [880, 0.09, 0.14]] : kind === "wrong" ? [[220, 0, 0.18], [180, 0.15, 0.22]] : kind === "win" ? [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.25]] : [[440, 0, 0.05]];
      for (const [f, t, d] of seq) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = kind === "wrong" ? "sawtooth" : "sine";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + d);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + d + 0.05);
      }
      setTimeout(() => void ctx.close(), 1500);
    } catch {
      /* 静音环境忽略 */
    }
  }, []);
  return play;
}

/** 撒花：全对 / 达成时调用 */
export function Confetti({ trigger }: { trigger: boolean }) {
  const [pieces, setPieces] = useState<{ id: number; x: number; c: string; d: number; s: number; delay: number }[]>([]);
  useEffect(() => {
    if (!trigger) return;
    const colors = ["#ff7a1a", "#1cb0f6", "#58cc02", "#ffc800", "#ff4b4b", "#a560ff"];
    // 在回调里生成随机数，避免在渲染/effect 主体里调用 Math.random
    const start = window.setTimeout(() => {
      setPieces(Array.from({ length: 80 }, (_, i) => ({ id: i, x: Math.random() * 100, c: colors[i % colors.length], d: 1.6 + Math.random() * 1.6, s: 6 + Math.random() * 8, delay: Math.random() * 0.6 })));
    }, 0);
    const stop = window.setTimeout(() => setPieces([]), 3600);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(stop);
    };
  }, [trigger]);
  if (pieces.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 block rounded-sm"
          style={{ left: `${p.x}%`, width: p.s, height: p.s * 1.6, background: p.c, animation: `fall ${p.d}s linear ${p.delay}s both` }}
        />
      ))}
    </div>
  );
}
