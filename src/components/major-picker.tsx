"use client";

import { ChevronDown, X } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { MajorCategoryKey } from "@/lib/major-categories";

export type MajorCatalog = {
  categories: {
    key: MajorCategoryKey;
    label: string;
    majors: string[];
  }[];
  others: string[];
};

type MajorPickerProps = {
  name?: string;
  defaultValue?: string;
  catalog: MajorCatalog;
  placeholder?: string;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[（）()【】[\]\s·•、，,。./\\_-]/g, "");
}

type Option = {
  label: string;
  value: string;
  hint?: string;
  group: string;
  isCategory?: boolean;
};

export function MajorPicker({
  name = "major",
  defaultValue = "",
  catalog,
  placeholder = "输入或选择专业大类...",
}: MajorPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(defaultValue);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 关闭：点击外部
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // 根据查询构造选项列表
  // 空查询：只显示 12 个大类
  // 有查询：显示大类（大类名匹配）+ 匹配的具体专业（按大类分组）
  // 搜索时限制每类/总量，避免 DOM 过大导致渲染卡顿
  const { options, grouped, truncated } = useMemo(() => {
    const MAX_PER_GROUP = 20;
    const MAX_TOTAL = 100;

    const q = normalize(query);
    if (!q) {
      const cats: Option[] = catalog.categories.map((cat) => ({
        label: cat.label,
        value: cat.label,
        hint: `${cat.majors.length} 个专业`,
        group: "大类",
        isCategory: true,
      }));
      return {
        options: cats,
        grouped: [{ label: "大类", items: cats }],
        truncated: false,
      };
    }

    const matchCategory = (label: string) => normalize(label).includes(q);
    const matchMajor = (m: string) => normalize(m).includes(q);

    const rawGroups: { label: string; items: Option[]; total: number }[] = [];

    // 1. 大类名匹配
    const matchedCats: Option[] = catalog.categories
      .filter((cat) => matchCategory(cat.label))
      .map((cat) => ({
        label: cat.label,
        value: cat.label,
        hint: `${cat.majors.length} 个专业`,
        group: "大类",
        isCategory: true,
      }));
    if (matchedCats.length > 0) {
      rawGroups.push({ label: "大类", items: matchedCats, total: matchedCats.length });
    }

    // 2. 具体专业匹配（按大类分组）
    for (const cat of catalog.categories) {
      const matched = cat.majors.filter(matchMajor);
      if (matched.length > 0) {
        const items: Option[] = matched.map((m) => ({
          label: m,
          value: m,
          hint: cat.label,
          group: cat.label,
        }));
        rawGroups.push({ label: cat.label, items, total: matched.length });
      }
    }

    // 3. 其他分组
    const matchedOthers = catalog.others.filter(matchMajor);
    if (matchedOthers.length > 0) {
      const items: Option[] = matchedOthers.map((m) => ({
        label: m,
        value: m,
        hint: "其他",
        group: "其他",
      }));
      rawGroups.push({ label: "其他", items, total: matchedOthers.length });
    }

    let remaining = MAX_TOTAL;
    const grouped: { label: string; items: Option[] }[] = [];
    let totalVisible = 0;
    for (const g of rawGroups) {
      const limit = Math.min(MAX_PER_GROUP, remaining);
      const items = g.items.slice(0, limit);
      if (items.length > 0) {
        grouped.push({ label: g.label, items });
      }
      remaining -= items.length;
      totalVisible += items.length;
    }

    const totalMatched = rawGroups.reduce((sum, g) => sum + g.total, 0);
    const options = grouped.flatMap((g) => g.items);
    return { options, grouped, truncated: totalVisible < totalMatched };
  }, [query, catalog]);

  const indexMap = useMemo(() => {
    const map = new Map<string, number>();
    options.forEach((option, index) => {
      map.set(`${option.group}::${option.value}`, index);
    });
    return map;
  }, [options]);

  function commit(value: string) {
    setQuery(value);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  }

  function clear() {
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function clearMouseDown(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    clear();
  }

  function handleInput(e: FormEvent<HTMLInputElement>) {
    setQuery((e.currentTarget as HTMLInputElement).value);
    setOpen(true);
    setActiveIndex(-1);
  }

  function handleFocus() {
    setOpen(true);
    if (options.length > 0 && activeIndex < 0) setActiveIndex(0);
  }

  function handleClick() {
    setOpen((prev) => !prev);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((idx) => Math.min(idx + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((idx) => Math.max(idx - 1, 0));
    } else if (e.key === "Enter") {
      if (open && activeIndex >= 0 && options[activeIndex]) {
        e.preventDefault();
        commit(options[activeIndex].value);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  // 滚动到激活项
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const container = listRef.current;
    if (!container) return;
    const active = container.querySelector(
      `[data-index="${activeIndex}"]`,
    ) as HTMLElement | null;
    if (active) {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, open]);

  return (
    <div className="major-picker" ref={containerRef}>
      <div className="major-picker-input-wrapper">
        <input
          ref={inputRef}
          name={name}
          value={query}
          onChange={handleInput}
          onFocus={handleFocus}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-label="目标专业"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="major-picker-listbox"
        />
        {query ? (
          <button
            type="button"
            className="major-picker-clear"
            onMouseDown={clearMouseDown}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            aria-label="清除"
          >
            <span style={{ pointerEvents: "none", display: "flex" }} aria-hidden="true">
              <X size={14} />
            </span>
          </button>
        ) : (
          <ChevronDown
            aria-hidden="true"
            className={`major-picker-chevron ${open ? "is-open" : ""}`}
            size={16}
          />
        )}
      </div>
      {open && options.length > 0 ? (
        <div
          id="major-picker-listbox"
          role="listbox"
          ref={listRef}
          className="major-picker-panel"
        >
          {grouped.map((group) => (
            <div key={group.label} className="major-picker-group">
              <div className="major-picker-group-label">
                <span className="major-picker-group-name">{group.label}</span>
                <span className="major-picker-group-count">{group.items.length}</span>
              </div>
              {group.items.map((option) => {
                const idx = indexMap.get(`${option.group}::${option.value}`) ?? -1;
                return (
                  <button
                    key={`${option.group}-${option.value}`}
                    type="button"
                    data-index={idx}
                    className={`major-picker-option ${
                      option.isCategory ? "is-category" : ""
                    } ${idx === activeIndex ? "is-active" : ""}`}
                    onClick={() => commit(option.value)}
                    role="option"
                    aria-selected={idx === activeIndex}
                  >
                    <span className="major-picker-option-label">{option.label}</span>
                    {option.hint ? (
                      <span className="major-picker-option-hint">{option.hint}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
          {truncated ? (
            <div className="major-picker-truncated">
              匹配结果过多，仅展示前 100 个，请输入更精确的专业名称
            </div>
          ) : null}
        </div>
      ) : open && options.length === 0 ? (
        <div className="major-picker-panel major-picker-empty">
          没有匹配的专业，按回车保留输入值
        </div>
      ) : null}
    </div>
  );
}
