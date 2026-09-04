"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/locale-context";

/** Falls back to the translated "返回" label unless an explicit text is passed. */
export function BackButton({
  text,
  className = "button",
}: {
  text?: string;
  className?: string;
}) {
  const router = useRouter();
  const t = useT();
  const label = text ?? t("返回");
  return (
    <button className={className} onClick={() => router.back()}>
      {label}
    </button>
  );
}
