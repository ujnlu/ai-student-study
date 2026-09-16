"use client";

import { Uploader } from "./uploader";

/** 作文拍照：走作文点评接口，完成后跳到作文详情页（客户端组件，可以给 Uploader 传函数） */
export function EssayUploader({ childId }: { childId: string }) {
  return (
    <Uploader
      childId={childId}
      subjects={[{ id: "chinese", name: "语文" }, { id: "english", name: "英语" }]}
      defaultSubject="chinese"
      kind="essay"
      gradeUrl={(id) => `/api/uploads/${id}/essay`}
      redirectTo={(id) => `/child/essay/${id}`}
      hint="把作文本平放，整页拍进来，字要看得清楚。作文太长可以分两次拍"
      submitLabel="✨ 请老师点评"
    />
  );
}
