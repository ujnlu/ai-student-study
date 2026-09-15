import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { Uploader } from "@/components/uploader";

export default async function UploadPage() {
  const { child } = await requireChild();
  const subjects = await db.subject.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">拍作业</h1>
      <Uploader childId={child.id} subjects={subjects} defaultSubject="math" />
    </div>
  );
}
