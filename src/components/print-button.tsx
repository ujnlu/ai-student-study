"use client";

export function PrintButton({ className = "btn-primary" }: { className?: string }) {
  return (
    <button type="button" className={`${className} no-print`} onClick={() => window.print()}>
      🖨️ 打印
    </button>
  );
}
