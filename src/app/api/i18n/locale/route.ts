import { NextResponse } from "next/server";

import { UI_LOCALE_COOKIE } from "@/lib/i18n/dict";

/** Persist the chosen UI locale (zh | en) in a long-lived cookie. */
export async function POST(request: Request) {
  let locale: "zh" | "en" = "zh";
  try {
    const body: unknown = await request.json();
    if (
      typeof body === "object" &&
      body !== null &&
      (body as { locale?: unknown }).locale === "en"
    ) {
      locale = "en";
    }
  } catch {
    // ignore malformed bodies, fall back to zh
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(UI_LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
  return res;
}
