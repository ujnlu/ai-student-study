"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Mascot, MascotSays } from "@/components/mascot";
import { Confetti, useSfx } from "@/components/fx";

type Piece = { title: string; author: string; text: string; kind: "poem" | "passage" };
type ReciteData = { chapterId: string; title: string; pieces: Piece[] };
type DiffChar = { ch: string; ok: boolean };
type Result = { accuracy: number; diff: DiffChar[]; stars: number; matched: number; total: number };
type Phase = "loading" | "ready" | "recording" | "scoring" | "result";

// 浏览器的 SpeechRecognition 类型声明不全，这里只声明用到的部分
type SREvent = { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } };
type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type SRCtor = new () => SR;

function getSR(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// 服务端按"支持"渲染，客户端再按真实情况更新，避免水合不一致
const noopSubscribe = () => () => {};
function useSrSupported() {
  return useSyncExternalStore(noopSubscribe, () => !!getSR(), () => true);
}

const GRAPE_BTN = "btn bg-grape text-white shadow-[0_4px_0_0_#7c3aed] active:translate-y-[4px] active:shadow-none hover:brightness-105";
const PASS = 90;

export function RecitePlayer({ chapterId, chapterTitle, initial }: { chapterId: string; chapterTitle: string; initial: ReciteData | null }) {
  const play = useSfx();
  const [data, setData] = useState<ReciteData | null>(initial);
  const [pieceIdx, setPieceIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>(initial ? "ready" : "loading");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [typed, setTyped] = useState("");
  const [manual, setManual] = useState(false);
  const [peek, setPeek] = useState(0);
  const [hint, setHint] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [srMsg, setSrMsg] = useState<string | null>(null);
  const srRef = useRef<SR | null>(null);
  const finalRef = useRef("");
  const recordingRef = useRef(false);
  const srSupported = useSrSupported();

  const piece = data?.pieces[pieceIdx] ?? null;

  const load = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const r = await fetch(`/api/recite?chapterId=${encodeURIComponent(chapterId)}`);
      const j = (await r.json()) as ReciteData & { error?: string };
      if (!r.ok || !j.pieces?.length) throw new Error(j.error ?? "没找到要背的内容");
      setData(j);
      setPieceIdx(0);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("ready");
    }
  }, [chapterId]);

  useEffect(() => {
    if (initial) return;
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [initial, load]);

  // 看一眼：3 秒倒计时
  useEffect(() => {
    if (peek <= 0) return;
    const t = window.setTimeout(() => setPeek((p) => p - 1), 1000);
    return () => window.clearTimeout(t);
  }, [peek]);

  // 卸载时关掉麦克风
  useEffect(
    () => () => {
      recordingRef.current = false;
      srRef.current?.abort();
    },
    [],
  );

  function startRecording() {
    const Ctor = getSR();
    if (!Ctor) {
      setManual(true);
      return;
    }
    play("tap");
    setSrMsg(null);
    finalRef.current = "";
    setTranscript("");
    setResult(null);
    const rec = new Ctor();
    rec.lang = "zh-CN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interim += r[0].transcript;
      }
      setTranscript(finalRef.current + interim);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        recordingRef.current = false;
        setSrMsg("没有拿到麦克风权限，可以改成打字或让爸爸妈妈确认～");
        setManual(true);
        setPhase("ready");
        return;
      }
      setSrMsg(`麦克风出了点小问题（${e.error}），再试一次吧`);
    };
    rec.onend = () => {
      // Chrome 安静几秒就会自动停，还在背就接着录
      if (recordingRef.current) {
        try {
          rec.start();
        } catch {
          /* ignore */
        }
      }
    };
    srRef.current = rec;
    recordingRef.current = true;
    try {
      rec.start();
      setPhase("recording");
    } catch {
      setSrMsg("麦克风打不开，换成打字试试～");
      setManual(true);
    }
  }

  function stopRecording() {
    recordingRef.current = false;
    srRef.current?.stop();
    srRef.current = null;
  }

  async function submit(text: string) {
    if (!piece) return;
    setPhase("scoring");
    setError(null);
    try {
      const r = await fetch("/api/recite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chapterId, title: piece.title, text: piece.text, transcript: text }),
      });
      const j = (await r.json()) as Result & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "打分失败");
      setResult(j);
      setPhase("result");
      play(j.accuracy >= PASS ? "win" : j.accuracy >= 60 ? "correct" : "wrong");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("ready");
    }
  }

  function finish() {
    const text = (finalRef.current || transcript).trim();
    stopRecording();
    if (!text) {
      setSrMsg("橙橙还没听到你背哦，再大声一点试试～");
      setPhase("ready");
      return;
    }
    void submit(text);
  }

  function reset() {
    play("tap");
    stopRecording();
    setTranscript("");
    setTyped("");
    setResult(null);
    setPeek(0);
    setHint(false);
    setSrMsg(null);
    setPhase("ready");
  }

  const lines = piece ? piece.text.split("\n").filter((l) => l.trim()) : [];
  const hintText = lines.map((l) => `${Array.from(l.replace(/[^一-龥]/g, "")).slice(0, 2).join("")}……`).join("　");

  if (phase === "loading") {
    return (
      <section className="card">
        <MascotSays mood="think">橙橙正在翻课本找要背的内容，大约 20 秒～</MascotSays>
      </section>
    );
  }

  if (!piece) {
    return (
      <section className="card space-y-3">
        <MascotSays mood="sad">{error ?? "没找到要背的内容"}</MascotSays>
        <button type="button" className="btn-secondary w-full" onClick={load}>
          🔁 再试一次
        </button>
      </section>
    );
  }

  // ---------- 结果 ----------
  if (phase === "result" && result) {
    const good = result.accuracy >= PASS;
    const color = good ? "text-leaf" : result.accuracy >= 70 ? "text-bee-dark" : "text-berry";
    return (
      <section className="card space-y-4">
        <Confetti trigger={good} />
        <div className="flex items-center gap-4">
          <Mascot mood={good ? "cheer" : result.accuracy >= 70 ? "happy" : "think"} size={110} className="anim-pop" />
          <div>
            <p className="text-muted font-bold">《{piece.title}》背对了</p>
            <p className={`text-6xl h-display ${color} anim-pop`}>
              {result.accuracy}
              <span className="text-3xl">%</span>
            </p>
            {result.stars > 0 ? (
              <p className="badge bg-bee-soft text-bee-dark text-sm mt-1">+{result.stars} ⭐ 太棒了！</p>
            ) : (
              <p className="text-sm text-muted mt-1">背到 {PASS}% 以上就能拿 8 颗星星</p>
            )}
          </div>
        </div>
        <div className="rounded-2xl bg-grape-soft/60 p-4 text-2xl leading-loose tracking-wider">
          {piece.author && <p className="text-base text-muted mb-1">{piece.author}</p>}
          {result.diff.map((d, i) =>
            d.ch === "\n" ? (
              <br key={i} />
            ) : (
              <span key={i} className={d.ok ? "" : "text-berry bg-berry-soft rounded px-0.5 underline decoration-wavy"}>
                {d.ch}
              </span>
            ),
          )}
        </div>
        {!good && <p className="text-base text-gray-600">红色的字是没背出来或背错的，再读几遍试试～</p>}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className={`${GRAPE_BTN} text-lg py-3`} onClick={reset}>
            🔁 再背一遍
          </button>
          <Link href="/child/recite" className="btn-secondary text-lg py-3">
            📚 换一课
          </Link>
        </div>
      </section>
    );
  }

  // ---------- 准备 / 背诵中 ----------
  const recording = phase === "recording";
  return (
    <section className="card space-y-4">
      {data && data.pieces.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {data.pieces.map((p, i) => (
            <button key={i} type="button" className={i === pieceIdx ? "chip-on border-grape bg-grape-soft text-grape" : "chip"} disabled={recording} onClick={() => { setPieceIdx(i); reset(); }}>
              {p.title}
            </button>
          ))}
        </div>
      )}
      <div className="text-center">
        <h2 className="text-2xl h-display">《{piece.title}》</h2>
        {piece.author && <p className="text-muted font-bold">{piece.author}</p>}
        <p className="text-xs text-muted mt-1">
          {chapterTitle} · {piece.kind === "poem" ? "古诗" : "课文"} · {piece.text.replace(/[^一-龥]/g, "").length} 字
        </p>
      </div>

      {/* 课文：默认藏起来 */}
      <div className="rounded-2xl bg-grape-soft/60 p-4 min-h-24 text-center">
        {peek > 0 ? (
          <div className="text-2xl leading-loose tracking-wider anim-pop">
            {lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
            <p className="text-sm text-muted mt-2">{peek} 秒后藏起来</p>
          </div>
        ) : hint ? (
          <p className="text-2xl leading-loose tracking-wider">{hintText}</p>
        ) : (
          <p className="text-lg font-bold text-grape py-4">🙈 课文藏起来啦，背给橙橙听吧</p>
        )}
      </div>
      <div className="flex gap-2 justify-center flex-wrap">
        <button type="button" className="chip" disabled={peek > 0} onClick={() => { play("tap"); setPeek(3); }}>
          👀 看一眼（3 秒）
        </button>
        <button type="button" className={hint ? "chip-on" : "chip"} onClick={() => { play("tap"); setHint((h) => !h); }}>
          💡 提示前两个字
        </button>
      </div>

      {srMsg && <p className="text-berry font-bold text-center">{srMsg}</p>}
      {error && <p className="text-berry font-bold text-center anim-shake">{error}</p>}

      {manual || !srSupported ? (
        <div className="space-y-3">
          {!srSupported && <p className="text-sm text-muted text-center">这个浏览器不能听你说话，可以打字或请爸爸妈妈确认～</p>}
          <textarea className="input text-xl leading-relaxed" rows={4} placeholder="把背的内容打在这里…" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={phase === "scoring"} />
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className={`${GRAPE_BTN} text-lg py-3`} disabled={phase === "scoring" || !typed.trim()} onClick={() => void submit(typed)}>
              {phase === "scoring" ? "⏳ 检查中…" : "✅ 交给橙橙检查"}
            </button>
            <button type="button" className="btn-leaf text-lg py-3" disabled={phase === "scoring"} onClick={() => void submit("家长确认")}>
              👨‍👩‍👧 家长确认背会了
            </button>
          </div>
          {srSupported && (
            <button type="button" className="btn-ghost w-full" onClick={() => setManual(false)}>
              ← 改回用麦克风
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {recording ? (
            <>
              <div className="rounded-2xl border-2 border-berry/40 bg-berry-soft/40 p-4 min-h-20 text-xl leading-relaxed">
                <p className="text-sm font-bold text-berry mb-1 flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-berry animate-pulse" /> 橙橙在听…
                </p>
                {transcript || <span className="text-muted">大声一点，慢慢背～</span>}
              </div>
              <button type="button" className={`${GRAPE_BTN} w-full text-xl py-4`} onClick={finish}>
                ✅ 背完了
              </button>
              <button type="button" className="btn-ghost w-full" onClick={reset}>
                重新来
              </button>
            </>
          ) : (
            <>
              <button type="button" className={`${GRAPE_BTN} w-full text-xl py-4`} disabled={phase === "scoring"} onClick={startRecording}>
                {phase === "scoring" ? "⏳ 橙橙在检查…" : "🎤 开始背诵"}
              </button>
              <button type="button" className="btn-ghost w-full text-sm" onClick={() => setManual(true)}>
                不用麦克风，打字 / 家长确认
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
