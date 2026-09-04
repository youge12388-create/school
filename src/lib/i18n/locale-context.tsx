"use client";

import { createContext, useContext, useMemo } from "react";

import { makeMessageT, makeT, makeTv, type UiLocale } from "./dict";

const LocaleContext = createContext<UiLocale>("zh");

export function LocaleProvider({
  locale,
  children,
}: {
  locale: UiLocale;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

/** Client components under <LocaleProvider> can bind the translator with useT(). */
export function useT() {
  const locale = useContext(LocaleContext);
  return useMemo(() => makeT(locale), [locale]);
}

export function useTv() {
  const locale = useContext(LocaleContext);
  return useMemo(() => makeTv(locale), [locale]);
}

/** Like useT, but also best-effort translates server messages with variables. */
export function useTm() {
  const locale = useContext(LocaleContext);
  return useMemo(() => makeMessageT(locale), [locale]);
}
