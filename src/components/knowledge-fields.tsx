"use client";

import { useLocale, useT } from "@/lib/i18n/locale-context";
import { parseMajorItems } from "@/lib/screening-results";
import { normalizeKeyword } from "@/lib/utils";

export const UNKNOWN_TEXT = "数据库未有相关信息";

export function displayValue(value: unknown) {
  if (value == null) return UNKNOWN_TEXT;
  if (typeof value === "string") return value.trim() || UNKNOWN_TEXT;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Render a raw value, localizing the "no info" placeholder only. */
export function displayValueLocalized(value: unknown, t: (s: string) => string) {
  const text = displayValue(value);
  return text === UNKNOWN_TEXT ? t(UNKNOWN_TEXT) : text;
}

function isLongField(label: string, value: unknown) {
  return (
    displayValue(value).length > 70 ||
    [
      "学校简介",
      "合作项目",
      "项目介绍",
      "专业列表",
      "专业方向",
      "申请要求及材料",
      "学期安排",
      "申请时间说明",
      "奖学金内容",
      "奖学金备注",
      "住宿费",
      "费用备注",
    ].includes(label)
  );
}

export function KnowledgeFieldGrid({
  fields,
  data,
  hideEmpty = false,
  targetMajor,
}: {
  fields: readonly string[];
  data: Record<string, unknown>;
  hideEmpty?: boolean;
  targetMajor?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const visibleFields = hideEmpty
    ? fields.filter((label) => displayValue(data[label]) !== UNKNOWN_TEXT)
    : fields;
  return (
    <div className="knowledge-field-grid">
      {visibleFields.map((label) => {
        const value = data[label];
        const text = displayValue(value);
        const majorItems =
          text !== UNKNOWN_TEXT && ["专业列表", "专业方向"].includes(label)
            ? parseMajorItems(text)
            : [];
        return (
          <div
            className={`knowledge-field${isLongField(label, value) ? " knowledge-field-wide" : ""}`}
            key={label}
          >
            <span>{t(label)}</span>
            {majorItems.length ? (
              <ul
                className="major-chip-list"
                aria-label={
                  locale === "en"
                    ? `${t(label)}: ${majorItems.length} majors`
                    : `${label}，共 ${majorItems.length} 个`
                }
              >
                {majorItems.map((major) => {
                  const majorMatch =
                    targetMajor &&
                    normalizeKeyword(major).includes(normalizeKeyword(targetMajor));
                  return (
                    <li className={`major-chip${majorMatch ? " highlight" : ""}`} key={major}>
                      {major}
                    </li>
                  );
                })}
              </ul>
            ) : label === "官网" && text !== UNKNOWN_TEXT ? (
              <a href={/^https?:\/\//i.test(text) ? text : `https://${text}`} target="_blank" rel="noreferrer">
                {text}
              </a>
            ) : (
              <p className={text === UNKNOWN_TEXT ? "muted" : undefined}>
                {displayValueLocalized(value, t)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
