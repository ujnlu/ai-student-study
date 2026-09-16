import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { SpeakingChat } from "@/components/speaking-chat";

const TITLE = "英语口语对话";
const hourAgo = () => new Date(Date.now() - 3600_000);

export default async function SpeakingChatPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { child } = await requireChild();
  const { new: fresh } = await searchParams;
  // 一小时内聊过的接着聊，否则开新的一段
  const since = hourAgo();
  const recent = fresh
    ? null
    : await db.conversation.findFirst({
        where: { childId: child.id, title: TITLE, updatedAt: { gte: since } },
        orderBy: { updatedAt: "desc" },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
  const initial = recent && recent.messages.length > 0 ? { conversationId: recent.id, messages: recent.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })) } : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="h-display text-2xl">💬 和橙橙聊英语</h1>
        <div className="flex gap-1">
          {initial && <Link href="/child/speaking/chat?new=1" className="btn-ghost text-sm">新话题</Link>}
          <Link href="/child/speaking" className="btn-ghost text-sm">‹ 口语</Link>
        </div>
      </div>
      <SpeakingChat childName={child.name} initial={initial} />
    </div>
  );
}
