import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { markUnderstoodAction } from "@/app/actions/study";
import { TutorChat } from "@/components/tutor-chat";
import { Mascot } from "@/components/mascot";

const KICKOFF = "我想请你帮我看看上面这道题，先别告诉我答案。";
const UPLOAD_TAG = /\n?\[upload:([a-z0-9]+)\]\s*$/i;

/** 第一条消息形如「题目：…\n[upload:<id>]」，拆出题目文字与照片 id */
function parseQuestion(content: string) {
  const m = content.match(UPLOAD_TAG);
  const uploadId = m?.[1] ?? null;
  const body = content.replace(UPLOAD_TAG, "").replace(/^题目：/, "").trim();
  return { text: body, uploadId };
}

export default async function AskConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { child } = await requireChild();
  const { id } = await params;
  const conv = await db.conversation.findFirst({
    where: { id, childId: child.id, mistakeId: null },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conv) notFound();

  const first = conv.messages[0];
  const q = first?.role === "user" ? parseQuestion(first.content) : { text: conv.title ?? "", uploadId: null };
  const upload = q.uploadId ? await db.upload.findFirst({ where: { id: q.uploadId, childId: child.id }, select: { filePath: true } }) : null;
  const initial = conv.messages.map((m, i) => ({
    role: m.role as "user" | "assistant",
    content: i === 0 ? m.content.replace(UPLOAD_TAG, "") : m.content,
  }));
  const onlyQuestion = conv.messages.length === 1 && first?.role === "user";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Link href="/child/ask" className="btn-ghost text-sm">‹ 再问一题</Link>
        {conv.understood === true && <span className="badge bg-leaf-soft text-leaf-dark normal-case tracking-normal text-sm py-1">😀 已经懂了</span>}
        {conv.understood === false && <span className="badge bg-bee-soft text-bee-dark normal-case tracking-normal text-sm py-1">🤔 还没懂</span>}
      </div>

      <div className="card py-3 flex gap-3">
        <Mascot mood="think" size={48} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-muted mb-1">你问的题</p>
          <p className="font-bold whitespace-pre-wrap">{q.text || "（题目在照片里）"}</p>
          {upload && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/files/${upload.filePath}`} alt="题目照片" className="mt-2 w-full max-h-64 object-contain rounded-2xl border-2 border-line bg-white" />
          )}
        </div>
      </div>

      <TutorChat conversationId={conv.id} childName={child.name} initial={initial} kickoff={onlyQuestion ? KICKOFF : undefined} />

      <div className="flex gap-2 justify-center">
        <form action={markUnderstoodAction}>
          <input type="hidden" name="conversationId" value={conv.id} />
          <input type="hidden" name="understood" value="true" />
          <button className="btn-primary">😀 我懂了</button>
        </form>
        <form action={markUnderstoodAction}>
          <input type="hidden" name="conversationId" value={conv.id} />
          <input type="hidden" name="understood" value="false" />
          <button className="btn-secondary">🤔 还是不懂</button>
        </form>
      </div>
    </div>
  );
}
