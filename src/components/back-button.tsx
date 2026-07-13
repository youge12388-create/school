"use client";

import { useRouter } from "next/navigation";

export function BackButton({ text = "返回", className = "button" }: { text?: string; className?: string }) {
  const router = useRouter();
  return (
    <button className={className} onClick={() => router.back()}>
      {text}
    </button>
  );
}
