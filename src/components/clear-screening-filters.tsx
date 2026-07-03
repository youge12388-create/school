"use client";

import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";

function clearFilterValues(form: HTMLFormElement) {
  for (const element of Array.from(form.elements)) {
    if (element instanceof HTMLSelectElement) {
      element.selectedIndex = 0;
      continue;
    }

    if (element instanceof HTMLInputElement) {
      if (element.type === "checkbox" || element.type === "radio") {
        element.checked = false;
      } else {
        element.value = "";
      }
    }
  }
}

export function ClearScreeningFilters() {
  const router = useRouter();

  function handleClear(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form) return;

    clearFilterValues(form);
    router.replace("/screening", { scroll: false });
  }

  return (
    <button className="button" type="button" onClick={handleClear}>
      清空条件
    </button>
  );
}
