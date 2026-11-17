"use client";

export function PrintButton() {
  return <button type="button" onClick={() => window.print()}>打印或保存 PDF</button>;
}
