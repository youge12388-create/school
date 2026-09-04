import "server-only";

import { cookies } from "next/headers";

import { UI_LOCALE_COOKIE, makeT, type UiLocale } from "./dict";

/** Read the persisted UI locale (defaults to zh). Server components only. */
export async function getUiLocale(): Promise<UiLocale> {
  const store = await cookies();
  return store.get(UI_LOCALE_COOKIE)?.value === "en" ? "en" : "zh";
}

/** `await getT()` returns the bound translator for the current request locale. */
export async function getT() {
  return makeT(await getUiLocale());
}
