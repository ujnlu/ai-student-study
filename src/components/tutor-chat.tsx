"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Msg = { role: "user" | "assistant"; content: string };

export function TutorChat({
  conversationId,
  initial,
  childName,
  kickoff,
}: {
  conversationId: string;
  initial: Msg[];
  childName: string;
  /** 可选：挂载时以孩子的身份自动发出这句话（用于「问橙橙」里题目已在历史中、需要老师先回复的场景） */
  kickoff?: string;
}) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function send(text: string) {
    if (busy) return;
    setBusy(true);
    if (text !== "__start__") setMsgs((m) => [...m, { role: "user", content: text }]);
    setMsgs((m) => [...m, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, text }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        setMsgs((m) => {
          const copy = m.slice();
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = { ...last, content: last.content + chunk };
          return copy;
        });
      }
    } catch (e) {
      setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: `出错了：${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  useEffect(() => {
    if (started.current) return;
    if (initial.length === 0) {
      started.current = true;
      void send("__start__");
    } else if (kickoff) {
      started.current = true;
      void send(kickoff);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function speak(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = 0.9;
    u.onerror = (e) => { console.error('[tts] error', e); };
    window.speechSynthesis.speak(u);
  }

  function listen() {
    const w = window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike; SpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      alert("这个浏览器不支持语音输入，试试 Chrome 或 Safari");
      return;
    }
    const rec = new Ctor();
    rec.lang = "zh-CN";
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const t = ev.results[0][0].transcript;
      setInput((v) => v + t);
    };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-14rem)]">
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 whitespace-pre-wrap leading-relaxed ${
                m.role === "user" ? "bg-brand text-white" : "bg-white border border-gray-100 shadow-sm"
              }`}
            >
              {m.role === "assistant" && (
                <button type="button" onClick={() => speak(m.content)} className="float-right ml-2 text-gray-400 hover:text-gray-700" title="读给我听">
                  🔊
                </button>
              )}
              {m.content || (busy ? "老师正在想…" : "")}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const t = input.trim();
          if (!t) return;
          setInput("");
          void send(t);
        }}
      >
        <button type="button" onClick={listen} className={`btn-secondary ${listening ? "bg-red-100" : ""}`} title="语音输入">
          {listening ? "🎙️…" : "🎤"}
        </button>
        <input
          className="input flex-1 text-lg"
          placeholder={`${childName}，说说你是怎么想的…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button className="btn-primary" disabled={busy || !input.trim()}>发送</button>
      </form>
    </div>
  );
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((ev: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
};
