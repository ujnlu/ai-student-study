import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPin, sign, verifyPin } from "@/lib/crypto";

const COOKIE = "study_session";
const MAX_AGE = 60 * 60 * 24 * 30;

export type Session = {
  familyId: string;
  role: "parent" | "child";
  childId?: string;
  exp: number;
};

function encode(s: Session): string {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(raw: string | undefined): Session | null {
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig || sign(body) !== sig) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Session;
    if (s.exp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

/** 首次启动时用 PARENT_PIN 创建家庭 */
export async function ensureFamily() {
  const existing = await db.family.findFirst();
  if (existing) return existing;
  const pin = process.env.PARENT_PIN ?? "1234";
  return db.family.create({ data: { pinHash: hashPin(pin) } });
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return decode(store.get(COOKIE)?.value);
}

async function setSession(s: Omit<Session, "exp">) {
  const store = await cookies();
  store.set(COOKIE, encode({ ...s, exp: Date.now() + MAX_AGE * 1000 }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function loginParent(pin: string): Promise<boolean> {
  const family = await ensureFamily();
  if (!verifyPin(pin, family.pinHash)) return false;
  await setSession({ familyId: family.id, role: "parent" });
  return true;
}

/** 孩子端登录：选头像即可（家庭内使用，不设密码） */
export async function loginChild(childId: string): Promise<boolean> {
  const child = await db.child.findUnique({ where: { id: childId } });
  if (!child) return false;
  await setSession({ familyId: child.familyId, role: "child", childId: child.id });
  return true;
}

export async function logout() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function requireParent() {
  const s = await getSession();
  if (!s || s.role !== "parent") redirect("/login?mode=parent");
  return s;
}

export async function requireChild() {
  const s = await getSession();
  if (!s || !s.childId) redirect("/login");
  const child = await db.child.findUnique({
    where: { id: s.childId },
    include: { textbooks: { include: { textbookVersion: true, subject: true } } },
  });
  if (!child) redirect("/login");
  return { session: s, child };
}

/** 家长或孩子都可访问的页面 */
export async function requireAny() {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}
