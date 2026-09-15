"use server";

import { redirect } from "next/navigation";
import { loginChild, loginParent, logout } from "@/lib/auth";

export async function parentLoginAction(_: unknown, formData: FormData) {
  const pin = String(formData.get("pin") ?? "");
  const ok = await loginParent(pin);
  if (!ok) return { error: "PIN 不正确" };
  redirect("/parent");
}

export async function childLoginAction(formData: FormData) {
  const childId = String(formData.get("childId") ?? "");
  const ok = await loginChild(childId);
  if (!ok) redirect("/login");
  redirect("/child");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
