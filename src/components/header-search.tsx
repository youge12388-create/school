"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent, useRef } from "react";

export function HeaderSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function search() {
    const q = inputRef.current?.value.trim();
    if (q) {
      router.push(`/schools?q=${encodeURIComponent(q)}`);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    search();
  }

  return (
    <div className="header-search">
      <input
        ref={inputRef}
        placeholder="搜索学校..."
        aria-label="搜索学校"
        onKeyDown={handleKeyDown}
      />
      <button type="button" onClick={search}>搜索</button>
    </div>
  );
}