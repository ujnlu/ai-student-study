import Link from "next/link";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { PAPER_STAGES } from "@/lib/papers";
import { SUBJECT_NAME, type TopicSubject } from "@/lib/topics";
import { PaperUploader } from "@/components/paper-uploader";

const STATUS: Record<string, string> = { pending: "等待解析", parsing: "解析中", ready: "可做题", failed: "解析失败" };

export default async function PapersPage() {
  const s = await requireParent();
  const papers = await db.paper.findMany({ where: { familyId: s.familyId }, orderBy: { createdAt: "desc" } });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">📄 真题卷</h1>
        <p className="text-sm text-gray-500">把历年真题（PDF / 图片 / 文本）上传进来，AI 拆成题目入库。孩子端和家长自学里都能整卷限时做，做完逐题看解题讲解。仅供家庭自用。</p>
      </div>
      <section className="card">
        <h2 className="font-bold mb-3">上传一份试卷</h2>
        <PaperUploader />
      </section>
      <section>
        <h2 className="font-bold text-lg mb-2">已导入（{papers.length}）</h2>
        {papers.length === 0 ? (
          <div className="card text-gray-500 text-sm">还没有导入试卷。</div>
        ) : (
          <ul className="space-y-2">
            {papers.map((p) => (
              <li key={p.id}>
                <Link href={`/parent/papers/${p.id}`} className="card-flat flex items-center gap-3 hover:shadow-md">
                  <span className="text-2xl">📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{p.title}</p>
                    <p className="text-xs text-gray-500">{PAPER_STAGES[p.stage] ?? p.stage} · {SUBJECT_NAME[p.subject as TopicSubject] ?? p.subject}{p.year ? ` · ${p.year}` : ""} · {p.total} 题 · {p.minutes} 分钟</p>
                  </div>
                  <span className={`badge ${p.status === "ready" ? "bg-leaf-soft text-leaf-dark" : p.status === "failed" ? "bg-berry-soft text-berry-dark" : "bg-bee-soft text-bee-dark"}`}>{STATUS[p.status] ?? p.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
