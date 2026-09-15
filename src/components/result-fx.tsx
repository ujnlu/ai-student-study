"use client";

import { useEffect, useState } from "react";
import { Confetti, useSfx } from "./fx";

/** 成绩页的撒花和音效（全对时） */
export function ResultFx({ perfect }: { perfect: boolean }) {
  const play = useSfx();
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!perfect) return;
    const t = window.setTimeout(() => {
      setGo(true);
      play("win");
    }, 200);
    return () => window.clearTimeout(t);
  }, [perfect, play]);
  return <Confetti trigger={go} />;
}
