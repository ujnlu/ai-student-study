"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mascot } from "@/components/mascot";
import { useSfx } from "@/components/fx";

type Msg = { role: "user" | "assistant"; content: string };

type SREvent = { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } };
type SR = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; abort(): void; onresult: ((e: SREvent) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
type SRCtor = new () => SR;
function getSR(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
const noop = () => () => {};

const STARTERS = ["Hello! How are you?", "I like cats.", "What's your name?", "I'm happy today.", "Do you like apples?"];

/** 把回复拆成英文 + 括号里的中文 */
function splitReply(s: string) {
  const m = /^([\s\S]*?)\s*[（(]([^()（）]*)[)）]\s*$/.exec(s.trim());
  return m ? { en: m[1].trim(), zh: m[2].trim() } : { en: s.trim(), zh: "" };
}

export function SpeakingChat({ childName, initial }: { childName: string; initial?: { conversationId: string; messages: Msg[] } | null }) {
  const play = useSfx();
  const srSupported = useSyncExternalStore(noop, () => !!getSR(), () => true);
  const [convId, setConvId] = useState<string | null>(initial?.conversationId ?? null);
  const [msgs, setMsgs] = useState<Msg[]>(initial?.messages ?? []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const srRef = useRef<SR | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);
  // 预加载语音列表 + 监听异步加载完成
  const [voicesReady, setVoicesReady] = useState(false);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const check = () => { if (synth.getVoices().length > 0) setVoicesReady(true); };
    check();
    synth.addEventListener("voiceschanged", check);
    return () => {
      synth.removeEventListener("voiceschanged", check);
      synth.cancel();
    };
  }, []);

  function speak(text: string) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((x) => /en[-_]US/i.test(x.lang)) ?? voices.find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    u.onerror = (e) => { console.error('[tts] error', e); };
    window.speechSynthesis.speak(u);
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    window.speechSynthesis?.cancel();
    setErr(null);
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: t }]);
    setBusy(true);
    try {
      const r = await fetch("/api/speaking/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: convId, text: t }) });
      const j = (await r.json()) as { conversationId?: string; reply?: string; error?: string };
      if (j.conversationId) setConvId(j.conversationId);
      if (!r.ok || !j.reply) throw new Error(j.error ?? "橙橙走神了，再说一遍吧");
      setMsgs((m) => [...m, { role: "assistant", content: j.reply! }]);
      play("correct");
      if (autoSpeak) speak(splitReply(j.reply).en);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function listen() {
    const Ctor = getSR();
    if (!Ctor) return;
    window.speechSynthesis?.cancel();
    play("tap");
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    let final = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += " " + r[0].transcript;
        else interim += r[0].transcript;
      }
      setInput((final + " " + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech") setErr("橙橙没听到，再说一次～");
      else if (e.error !== "aborted") setErr(`麦克风出了点小问题（${e.error}）`);
    };
    rec.onend = () => {
      setListening(false);
      srRef.current = null;
      const t = final.trim();
      if (t) void send(t);
    };
    srRef.current = rec;
    try {
      rec.start();
      setListening(true);
      setErr(null);
    } catch {
      setErr("麦克风打不开");
    }
  }

  return (
    <div className="space-y-3">
      <div className="card min-h-[50vh] max-h-[60vh] overflow-y-auto space-y-3">
        {msgs.length === 0 && (
          <div className="flex items-end gap-3">
            <Mascot mood="happy" size={64} className="shrink-0" />
            <div className="card-flat rounded-3xl rounded-bl-md bg-sky-soft/60">
              <p className="font-extrabold">Hi {childName}! I&apos;m Chengcheng. Let&apos;s talk in English!</p>
              <p className="text-sm text-muted">（嗨 {childName}！我是橙橙，我们用英语聊聊吧！）</p>
            </div>
          </div>
        )}
        {msgs.map((m, i) => {
          if (m.role === "user") return <div key={i} className="flex justify-end"><div className="rounded-3xl rounded-br-md bg-brand text-white px-4 py-2.5 font-extrabold max-w-[80%]">{m.content}</div></div>;
          const { en, zh } = splitReply(m.content);
          return (
            <div key={i} className="flex items-end gap-3">
              <Mascot mood="happy" size={56} className="shrink-0" />
              <div className="card-flat rounded-3xl rounded-bl-md bg-sky-soft/60 max-w-[85%]">
                <p className="font-extrabold text-lg">{en}</p>
                {zh && <p className="text-sm text-muted mt-0.5">（{zh}）</p>}
                <button type="button" className="text-xs font-bold text-sky-dark mt-1" onClick={() => speak(en)}>🔊 再听一遍</button>
              </div>
            </div>
          );
        })}
        {busy && (
          <div className="flex items-end gap-3">
            <Mascot mood="think" size={56} className="shrink-0" />
            <div className="card-flat rounded-3xl rounded-bl-md bg-sky-soft/60 text-muted font-bold">Hmm… 🤔</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {msgs.length === 0 && (
        <div className="flex gap-2 flex-wrap">
          {STARTERS.map((s) => <button key={s} type="button" className="chip" onClick={() => void send(s)}>{s}</button>)}
        </div>
      )}
      {err && <p className="text-berry text-sm font-bold">{err}</p>}

      <div className="flex gap-2 items-stretch">
        {srSupported && (
          <button type="button" className={`${listening ? "btn-danger" : "btn-sky"} text-2xl px-5`} disabled={busy} onClick={() => (listening ? srRef.current?.stop() : listen())} aria-label="说话">
            {listening ? "⏹" : "🎤"}
          </button>
        )}
        <input
          className="input flex-1 text-lg"
          lang="en"
          placeholder={listening ? "Listening…" : "Type in English…"}
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <button type="button" className="btn-primary" disabled={busy || !input.trim()} onClick={() => void send(input)}>发送</button>
      </div>
      <label className="flex items-center gap-2 text-xs font-bold text-muted">
        <input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} /> 橙橙自动朗读回复
      </label>
    </div>
  );
}
