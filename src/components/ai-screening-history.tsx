"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, MessageSquare, Pencil, Pin, Plus, Search, Trash2, X } from "lucide-react";
import type { ScreeningSessionSummary } from "@/lib/ai-screening-sessions";

const MODE_SHORT: Record<string, string> = {
  partner_priority: "模式二",
  standard_all: "模式一",
  partner_quick: "模式三",
};

function formatRelativeTime(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  const d = new Date(ts);
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function groupSessions(items: ScreeningSessionSummary[]) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const weekMs = todayMs - 6 * 86_400_000;

  const pinned: ScreeningSessionSummary[] = [];
  const today: ScreeningSessionSummary[] = [];
  const week: ScreeningSessionSummary[] = [];
  const older: ScreeningSessionSummary[] = [];

  for (const item of items) {
    if (item.pinned) pinned.push(item);
    else if (item.updatedAt >= todayMs) today.push(item);
    else if (item.updatedAt >= weekMs) week.push(item);
    else older.push(item);
  }

  return [
    { key: "pinned", label: "置顶会话", items: pinned },
    { key: "today", label: "今天", items: today },
    { key: "week", label: "过去 7 天", items: week },
    { key: "older", label: "更早", items: older },
  ].filter((g) => g.items.length > 0);
}

export function SessionHistorySidebar({
  sessions,
  activeSessionId,
  loading,
  busy,
  open,
  onClose,
  onSelect,
  onNew,
  onRename,
  onTogglePin,
  onDelete,
}: {
  sessions: ScreeningSessionSummary[];
  activeSessionId: string | null;
  loading: boolean;
  busy: boolean;
  open: boolean;
  onClose: () => void;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
  onRename: (sessionId: string, title: string) => void;
  onTogglePin: (sessionId: string, pinned: boolean) => void;
  onDelete: (sessionId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) =>
      s.title.toLowerCase().includes(q)
      || s.preview.toLowerCase().includes(q)
      || s.criteriaTags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [query, sessions]);

  const groups = useMemo(() => groupSessions(filtered), [filtered]);

  function commitRename(id: string) {
    const cleaned = editTitle.trim();
    if (cleaned) onRename(id, cleaned);
    setEditingId(null);
  }

  return (
    <aside
      className={`agent-history-sidebar${open ? " is-open" : " is-collapsed"}`}
      aria-label="选校历史对话"
      aria-hidden={!open}
    >
      <div className="agent-history-sidebar-inner">
        <div className="agent-history-top">
          <button type="button" className="agent-history-new-btn" onClick={onNew} disabled={busy}>
            <Plus size={15} aria-hidden="true" /> 新建选校
          </button>
          <button
            type="button"
            className="agent-icon-btn agent-history-collapse-btn"
            onClick={onClose}
            title="收起选校历史"
            aria-label="收起选校历史"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="agent-history-search">
          <Search size={13} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索学生、专业或国家…"
            aria-label="搜索历史会话"
          />
          {query && (
            <button type="button" className="agent-history-clear" onClick={() => setQuery("")} aria-label="清空搜索">
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="agent-history-list">
          {loading && sessions.length === 0 ? (
            <p className="agent-history-empty">正在读取历史会话…</p>
          ) : groups.length === 0 ? (
            <div className="agent-history-empty">
              <MessageSquare size={20} aria-hidden="true" />
              <p>{query ? "未找到匹配的选校记录" : "暂无历史选校记录"}</p>
              <span>发起首条筛选后会自动保存，新开窗口也能随时继续。</span>
            </div>
          ) : (
            groups.map((group) => (
              <div className="agent-history-group" key={group.key}>
                <div className="agent-history-group-label">{group.label}</div>
                <ul>
                  {group.items.map((item) => {
                    const isActive = item.id === activeSessionId;
                    const isEditing = editingId === item.id;
                    const isConfirmDelete = confirmDeleteId === item.id;
                    return (
                      <li key={item.id} className={`agent-history-item${isActive ? " is-active" : ""}`}>
                        {isEditing ? (
                          <form
                            className="agent-history-edit"
                            onSubmit={(e) => { e.preventDefault(); commitRename(item.id); }}
                          >
                            <input
                              autoFocus
                              value={editTitle}
                              maxLength={60}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Escape") setEditingId(null); }}
                            />
                            <button type="submit" aria-label="保存标题"><Check size={13} /></button>
                            <button type="button" onClick={() => setEditingId(null)} aria-label="取消重命名"><X size={13} /></button>
                          </form>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="agent-history-select"
                              onClick={() => onSelect(item.id)}
                              disabled={busy && !isActive}
                              title={item.title}
                            >
                              <div className="agent-history-title-row">
                                <span className="agent-history-title">{item.title}</span>
                                <span className="agent-history-time">{formatRelativeTime(item.updatedAt)}</span>
                              </div>
                              <div className="agent-history-meta">
                                <span className="agent-history-mode">{MODE_SHORT[item.runMode] ?? "模式二"}</span>
                                <span>{item.turnCount} 轮</span>
                                {item.criteriaTags.slice(0, 2).map((tag) => (
                                  <span className="agent-history-tag" key={tag}>{tag}</span>
                                ))}
                              </div>
                            </button>

                            <div className="agent-history-actions">
                              {isConfirmDelete ? (
                                <>
                                  <button
                                    type="button"
                                    className="is-danger"
                                    onClick={() => { setConfirmDeleteId(null); onDelete(item.id); }}
                                    title="确认删除"
                                  >
                                    删
                                  </button>
                                  <button type="button" onClick={() => setConfirmDeleteId(null)} title="取消">
                                    <X size={12} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className={item.pinned ? "is-pinned" : ""}
                                    onClick={() => onTogglePin(item.id, !item.pinned)}
                                    title={item.pinned ? "取消置顶" : "置顶"}
                                    aria-label={item.pinned ? "取消置顶" : "置顶"}
                                  >
                                    <Pin size={12} aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setEditingId(item.id); setEditTitle(item.title); setConfirmDeleteId(null); }}
                                    title="重命名"
                                    aria-label="重命名"
                                  >
                                    <Pencil size={12} aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(item.id)}
                                    title="删除会话"
                                    aria-label="删除会话"
                                  >
                                    <Trash2 size={12} aria-hidden="true" />
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
