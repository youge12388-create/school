"use client";

import { useEffect } from "react";

export function ScrollToProgram({ programId }: { programId: string }) {
  useEffect(() => {
    const el = document.getElementById(`program-${programId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("program-highlight-flash");
    }
  }, [programId]);
  return null;
}
