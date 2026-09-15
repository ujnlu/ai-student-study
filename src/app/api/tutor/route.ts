import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveAssistant, runStream } from "@/lib/ai";
import { gradeText, renderTemplate } from "@/lib/ai/prompts";
import type { ChatMessage } from "@/lib/ai/types";
import { textbookContext, withTextbookContext } from "@/lib/textbook-context";

export const runtime = "nodejs";
export const maxDuration = 120;

const SUBJECT_NAME: Record<string, string> = { math: "数学", chinese: "语文", english: "英语" };

/**
 * POST { conversationId, text }
 * 返回 text/plain 流。首次消息由前端传 text="__start__" 让老师先开口。
 */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return new Response("未登录", { status: 401 });
  const { conversationId, text } = (await req.json()) as { conversationId: string; text: string };

  const conv = await db.conversation.findFirst({
    where: { id: conversationId, child: { familyId: s.familyId } },
    include: {
      child: { include: { textbooks: { include: { textbookVersion: true } } } },
      mistake: { include: { problem: { include: { attempts: { orderBy: { createdAt: "desc" }, take: 1 } } } } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!conv) return new Response("对话不存在", { status: 404 });

  const child = conv.child;
  const problem = conv.mistake?.problem;
  const subjectId = problem?.subjectId ?? "math";
  const textbook = child.textbooks.find((t) => t.subjectId === subjectId)?.textbookVersion.name ?? "人教版";
  const assistant = await resolveAssistant(child.familyId, "tutor");
  const ctx = await textbookContext({ childId: child.id, subjectId, knowledgePointId: problem?.knowledgePointId, query: problem?.stem }).catch(() => null);
  const system = withTextbookContext(renderTemplate(assistant.systemPrompt, {
    childName: child.name,
    grade: child.grade,
    gradeText: gradeText(child.grade),
    semester: child.semester === 1 ? "上学期" : "下学期",
    subject: SUBJECT_NAME[subjectId] ?? "全科",
    textbook,
    region: child.region,
    problem: problem?.stem,
    childAnswer: problem?.attempts[0]?.childAnswer ?? "（没有作答）",
    correctAnswer: problem?.answer,
    solution: problem?.solution,
  }), ctx);

  const isStart = text === "__start__";
  if (!isStart) {
    await db.message.create({ data: { conversationId, role: "user", content: text } });
  }
  const history: ChatMessage[] = conv.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  if (isStart) {
    history.push({ role: "user", content: "（孩子打开了这道错题，请你先开口，用一句话打招呼并问孩子当时是怎么想的。）" });
  } else {
    history.push({ role: "user", content: text });
  }

  const encoder = new TextEncoder();
  let full = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of runStream(assistant, { system, messages: history })) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        await db.message.create({ data: { conversationId, role: "assistant", content: full } });
        await db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
        controller.close();
      } catch (e) {
        controller.enqueue(encoder.encode(`\n\n[出错了：${e instanceof Error ? e.message : String(e)}]`));
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" } });
}
