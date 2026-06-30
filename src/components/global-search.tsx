"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef } from "react";

export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = inputRef.current?.value.trim();
    if (q) {
      router.push(`/schools?q=${encodeURIComponent(q)}`);
    }
  }

  return (
    <form className="global-search" onSubmit={handleSubmit}>
      <Search aria-hidden="true" className="global-search-icon" />
      <input
        ref={inputRef}
        name="global-q"
        placeholder="搜索学校、项目..."
        aria-label="全局搜索"
      />
    </form>
  );
}