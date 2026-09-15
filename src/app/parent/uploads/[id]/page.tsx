import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { UploadResult } from "@/components/upload-result";
import { notFound } from "next/navigation";

export default async function ParentUploadPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireParent();
  const { id } = await params;
  const u = await db.upload.findFirst({ where: { id, child: { familyId: s.familyId } } });
  if (!u) notFound();
  return <UploadResult uploadId={id} />;
}
