import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { Uploader } from "@/components/uploader";
import { MascotSays } from "@/components/mascot";

export default async function UploadPage() {
  const { child } = await requireChild();
  const subjects = await db.subject.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <div className="space-y-4">
      <h1 className="h-display text-2xl">📷 拍作业</h1>
      <MascotSays mood="happy">把作业平放在桌上，光线亮一点，一页一拍。橙橙 1 分钟内帮你检查完！</MascotSays>
      <div className="card">
        <Uploader childId={child.id} subjects={subjects} defaultSubject="math" />
      </div>
      <ul className="grid grid-cols-3 gap-2 text-center text-xs font-bold text-muted">
        <li className="card-flat"><div className="text-2xl">☀️</div>光线要亮</li>
        <li className="card-flat"><div className="text-2xl">📐</div>放平不要歪</li>
        <li className="card-flat"><div className="text-2xl">✍️</div>字写清楚</li>
      </ul>
    </div>
  );
}
