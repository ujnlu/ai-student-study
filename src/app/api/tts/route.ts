import { NextRequest, NextResponse } from "next/server";
import WebSocket from "ws";

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || "";
const TTS_MODEL = process.env.TTS_MODEL || "cosyvoice-v1";
const TTS_VOICE = process.env.TTS_VOICE || "longxiaochun";
const WS_URL =
  process.env.DASHSCOPE_WS_URL ||
  "wss://dashscope.aliyuncs.com/api-ws/v1/inference";

/**
 * CosyVoice WebSocket 非实时语音合成
 * 协议: run-task → task-started → continue-task(文本) → finish-task → audio chunks → task-finished
 */
async function synthesizeViaWs(text: string, voice: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, {
      headers: { Authorization: `Bearer ${DASHSCOPE_API_KEY}` },
    });

    const audioChunks: Buffer[] = [];
    const taskId = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let finished = false;

    const timeout = setTimeout(() => {
      if (!finished) { ws.close(); reject(new Error("TTS WebSocket timeout (30s)")); }
    }, 30000);

    const done = (err?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      ws.close();
      if (err) reject(err);
      else if (audioChunks.length === 0) reject(new Error("TTS returned no audio data"));
      else resolve(Buffer.concat(audioChunks));
    };

    ws.on("open", () => {
      // Step 1: run-task — 建立合成会话
        console.log("[TTS] WebSocket opened:", WS_URL);
	ws.send(JSON.stringify({
        header: { action: "run-task", task_id: taskId, streaming: "duplex" },
        payload: {
          model: TTS_MODEL,
          task_group: "audio",
          task: "tts",
          function: "SpeechSynthesizer",
          parameters: { voice, format: "mp3", sample_rate: 22050 },
          input: {},
        },
      }));
    });

    ws.on("message", (data: WebSocket.Data) => {
      if (finished) return;

      // Binary frame = 音频数据
      if (Buffer.isBuffer(data) && !data.toString("utf8", 0, 1).startsWith("{")) {
        audioChunks.push(data);
        return;
      }

      // JSON control message
      try {
        const msg = JSON.parse(data.toString());
        const event = msg?.header?.event;
      // console.log("[TTS] message:", JSON.stringify(msg));

        if (event === "task-started") {
          // Step 2: continue-task — 发送合成文本
          ws.send(JSON.stringify({
            header: { action: "continue-task", task_id: taskId, streaming: "duplex" },
            payload: { input: { text } },
          }));
          // Step 3: finish-task — 告知服务端文本发送完毕
          ws.send(JSON.stringify({
            header: { action: "finish-task", task_id: taskId, streaming: "duplex" },
            payload: { input: {} },
          }));
        } else if (event === "task-finished") {
          done();
        } else if (event === "task-failed") {
          done(new Error(msg?.header?.error_message || "TTS task failed"));
        }
        // result-generated events carry audio in subsequent binary frames
      } catch {
        // ignore parse errors
      }
    });
ws.on("error", (err) => {
  console.error("[TTS] WebSocket error:", err);
  done(err);
});

ws.on("close", (code, reason) => {
  console.log(
    "[TTS] WebSocket closed:",
    code,
    reason.toString(),
    "audio_chunks:",
    audioChunks.length
  );

  if (!finished) done();
});
  });
}

export async function POST(req: NextRequest) {
  if (!DASHSCOPE_API_KEY) {
    return NextResponse.json({ error: "DASHSCOPE_API_KEY not configured" }, { status: 500 });
  }

  let body: { text?: string; voice?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = (body.text || "").trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const safeText = text.length > 580 ? text.slice(0, 580) : text;
  const voice = body.voice || TTS_VOICE;

  try {
    const audioBuffer = await synthesizeViaWs(safeText, voice);
    return NextResponse.json({
      audioBase64: audioBuffer.toString("base64"),
      contentType: "audio/mpeg",
    });
  } catch (err) {
    console.error("[TTS] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "TTS synthesis failed" },
      { status: 502 },
    );
  }
}
