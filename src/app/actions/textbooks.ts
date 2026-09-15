"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireParent } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { parseCreds, SMARTEDU_TOKEN_KEY } from "@/lib/smartedu-auth";

export async function saveSmarteduTokenAction(formData: FormData) {
  const s = await requireParent();
  const raw = String(formData.get("token") ?? "").trim();
  if (!raw) {
    await db.familySetting.deleteMany({ where: { familyId: s.familyId, key: SMARTEDU_TOKEN_KEY } });
  } else {
    const creds = parseCreds(raw);
    if (!creds) {
      revalidatePath("/parent/textbooks");
      return;
    }
    await db.familySetting.upsert({
      where: { familyId_key: { familyId: s.familyId, key: SMARTEDU_TOKEN_KEY } },
      create: { familyId: s.familyId, key: SMARTEDU_TOKEN_KEY, value: encrypt(JSON.stringify(creds)) },
      update: { value: encrypt(JSON.stringify(creds)) },
    });
  }
  revalidatePath("/parent/textbooks");
}
