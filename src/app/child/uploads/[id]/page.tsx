import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireChild } from "@/lib/auth";
import { UploadResult } from "@/components/upload-result";

export default async function ChildUploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { child } = await requireChild();
  const { id } = await params;
  const u = await db.upload.findFirst({ where: { id, childId: child.id } });
  if (!u) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">批改结果</h1>
      <UploadResult uploadId={id} />
    </div>
  );
}
