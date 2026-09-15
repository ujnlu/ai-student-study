"use client";

import { useActionState } from "react";
import { parentLoginAction } from "@/app/actions/auth";

export function ParentPinForm() {
  const [state, action, pending] = useActionState(parentLoginAction, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label">家长 PIN</label>
        <input name="pin" type="password" inputMode="numeric" autoFocus className="input text-center text-2xl tracking-widest" />
        {state?.error && <p className="text-red-600 text-sm mt-2">{state.error}</p>}
      </div>
      <button className="btn-primary w-full" disabled={pending}>{pending ? "登录中…" : "登录"}</button>
      <p className="text-xs text-gray-400 text-center">首次使用的 PIN 在 .env 的 PARENT_PIN 中设置</p>
    </form>
  );
}
