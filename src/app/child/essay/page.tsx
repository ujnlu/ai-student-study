import Link from "next/link";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { EssayUploader } from "@/components/essay-uploader";
import { MascotSays } from "@/components/mascot";
import { ESSAY_STARS } from "@/lib/ai/essay";

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "等待点评", cls: "bg-gray-100 text-gray-600" },
  grading: { label: "点评中", cls: "bg-bee-soft text-bee-dark" },
  graded: { label: "已点评", cls: "bg-leaf-soft text-leaf-dark" },
  failed: { label: "失败", cls: "bg-berry-soft text-berry-dark" },
};

export default async function EssayIntroPage() {
  const { child } = await requireChild();
  const past = await db.upload.findMany({ where: { childId: child.id, kind: "essay" }, orderBy: { createdAt: "desc" }, take: 10 });

  return (
    <div className="space-y-5">
      <h1 className="h-display text-3xl">✍️ 作文点评</h1>
      <MascotSays mood="happy">把写好的作文拍下来，橙橙老师会从内容、结构、语言、书写、错别字和亮点六个方面给你点评，还会告诉你哪里写得特别棒！</MascotSays>

      <div className="card bg-gradient-to-br from-grape-soft via-white to-white border-grape/30">
        <EssayUploader childId={child.id} />
      </div>

      <ul className="grid grid-cols-3 gap-2 text-center text-xs font-bold text-muted">
        <li className="card-flat"><div className="text-2xl">☀️</div>光线要亮</li>
        <li className="card-flat"><div className="text-2xl">📐</div>整页放平</li>
        <li className="card-flat"><div className="text-2xl">⭐</div>点评一次 +{ESSAY_STARS} 星</li>
      </ul>

      {past.length > 0 && (
        <section>
          <h2 className="font-extrabold mb-2">我写过的作文</h2>
          <ul className="space-y-2">
            {past.map((u) => {
              const st = STATUS[u.status] ?? STATUS.pending;
              return (
                <li key={u.id}>
                  <Link href={`/child/essay/${u.id}`} className="card-flat flex items-center gap-3 hover:shadow-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/${u.filePath}`} alt="作文" className="w-14 h-14 rounded-xl object-cover bg-gray-100 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate">{u.summary ? u.summary.replace(/\s+/g, " ").slice(0, 40) : "作文照片"}</p>
                      <p className="text-xs text-muted">{u.createdAt.toLocaleString("zh-CN")}</p>
                    </div>
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
