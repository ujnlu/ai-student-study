import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { ESSAY_DIMENSIONS, ESSAY_STARS } from "@/lib/ai/essay";
import { Mascot, MascotSays } from "@/components/mascot";

const DIM_ICON: Record<string, string> = { 内容: "📖", 结构: "🧩", 语言: "💬", 书写: "✍️", 错别字: "🔍", 亮点: "🌟" };

type Block = { type: "heading" | "para" | "item"; text: string; dim?: string };

/** 把点评文本拆成段落：以"："结尾、或以六个维度名开头的行作为小标题；"- / • / 1." 开头的行作为列表项 */
function parseFeedback(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    line = line.replace(/^#{1,6}\s*/, "").replace(/^\*\*(.+?)\*\*[:：]?\s*$/, "$1").replace(/\*\*/g, "");
    const dim = ESSAY_DIMENSIONS.find((d) => new RegExp(`^[【\\[（(]?(?:[一二三四五六1-6][、.．)）]\\s*)?${d}`).test(line));
    const isHeading = (dim && line.length <= 24) || (/[:：]$/.test(line) && line.length <= 24);
    if (isHeading) {
      blocks.push({ type: "heading", text: line.replace(/[:：]$/, "").replace(/^[【\[（(]|[】\]）)]$/g, ""), dim });
      continue;
    }
    const item = line.match(/^(?:[-•·*]|\d+[.、．)）])\s*(.+)$/);
    if (item) {
      blocks.push({ type: "item", text: item[1] });
      continue;
    }
    // "内容：写得很具体……" 这种"维度名：正文"写在同一行的情况，拆成标题 + 段落
    const inline = dim && line.match(/^(.{1,12}?)[:：]\s*(.+)$/);
    if (inline) {
      blocks.push({ type: "heading", text: inline[1], dim });
      blocks.push({ type: "para", text: inline[2] });
      continue;
    }
    blocks.push({ type: "para", text: line });
  }
  return blocks;
}

export default async function EssayDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { child } = await requireChild();
  const { id } = await params;
  const u = await db.upload.findFirst({ where: { id, childId: child.id, kind: "essay" } });
  if (!u) notFound();
  const blocks = u.status === "graded" && u.summary ? parseFeedback(u.summary) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="h-display text-3xl">✍️ 作文点评</h1>
        <Link href="/child/essay" className="btn-secondary text-sm">📷 再拍一篇</Link>
      </div>

      {u.status === "graded" && <MascotSays mood="cheer">点评好啦！先看看老师夸了你哪里，再看看哪里可以改得更好。+{ESSAY_STARS} ⭐</MascotSays>}
      {(u.status === "pending" || u.status === "grading") && (
        <MascotSays mood="think">
          橙橙老师还在认真读你的作文，通常要 20-60 秒。<Link href={`/child/essay/${u.id}`} className="underline text-sky-dark">刷新看看</Link>
        </MascotSays>
      )}
      {u.status === "failed" && (
        <MascotSays mood="sad">
          这次没点评成功：{u.error ?? "未知原因"}。<Link href="/child/essay" className="underline text-sky-dark">再拍一次试试</Link>
        </MascotSays>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="card p-2 self-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/files/${u.filePath}`} alt="作文照片" className="w-full rounded-2xl object-contain max-h-[70vh] bg-gray-50" />
          <div className="flex items-center justify-between px-2 py-2 text-xs text-muted font-bold">
            <span>{u.createdAt.toLocaleString("zh-CN")}</span>
            <a href={`/api/files/${u.filePath}`} target="_blank" className="underline">查看原图</a>
          </div>
        </div>

        <div className="card">
          {blocks.length > 0 ? (
            <div className="space-y-2 text-[15px] leading-relaxed">
              {blocks.map((b, i) =>
                b.type === "heading" ? (
                  <h2 key={i} className={`h-display text-lg mt-4 first:mt-0 ${b.dim === "亮点" ? "text-bee-dark" : b.dim === "错别字" ? "text-berry-dark" : "text-grape"}`}>
                    {b.dim ? DIM_ICON[b.dim] : "📌"} {b.text}
                  </h2>
                ) : b.type === "item" ? (
                  <p key={i} className="flex gap-2 pl-1">
                    <span className="text-brand">•</span>
                    <span className="font-semibold">{b.text}</span>
                  </p>
                ) : (
                  <p key={i} className="font-semibold">{b.text}</p>
                ),
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 text-muted font-bold gap-2">
              <Mascot mood={u.status === "failed" ? "sad" : "think"} size={90} />
              <p>{u.status === "failed" ? "这次没有点评内容" : "点评还没出来"}</p>
            </div>
          )}
        </div>
      </div>

      {u.status === "graded" && (
        <section className="card bg-leaf-soft/40 border-leaf/30">
          <h2 className="text-lg h-display mb-2">✅ 接下来可以</h2>
          <ul className="space-y-1.5 font-bold text-[15px]">
            <li className="flex gap-2"><span>1️⃣</span><span>把老师指出的错别字和病句在本子上改一遍。</span></li>
            <li className="flex gap-2"><span>2️⃣</span><span>挑一处「可以改得更好」的地方，试着重写那一句。</span></li>
            <li className="flex gap-2"><span>3️⃣</span><span>改完再拍一次，看看点评有没有变得更好！</span></li>
          </ul>
        </section>
      )}
    </div>
  );
}
