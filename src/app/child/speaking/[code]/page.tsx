import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { findSpeakTopic, getSpeakingLesson } from "@/lib/speaking";
import { SpeakingPlayer } from "@/components/speaking-player";

export default async function SpeakingLessonPage({ params }: { params: Promise<{ code: string }> }) {
  await requireChild();
  const { code } = await params;
  const topic = findSpeakTopic(code);
  const chapter = !topic && code.startsWith("ch-") ? await db.textbookChapter.findUnique({ where: { id: code.slice(3) } }) : null;
  if (!topic && !chapter) notFound();
  const title = topic ? `${topic.emoji} ${topic.name}` : `📖 ${chapter!.title}`;
  const initial = await getSpeakingLesson(code);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="h-display text-2xl">{title}</h1>
        <Link href="/child/speaking" className="btn-ghost text-sm">换个主题</Link>
      </div>
      <SpeakingPlayer code={code} initial={initial} />
    </div>
  );
}
