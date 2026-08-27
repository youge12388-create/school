"use client";

import { PencilLine } from "lucide-react";
import { createContext, useContext, useMemo, useState } from "react";

type EditModeContextValue = {
  editingMode: boolean;
  enter: () => void;
  exit: () => boolean;
  markDirty: (key: string, dirty: boolean) => void;
  dirtyCount: number;
};

const EditModeContext = createContext<EditModeContextValue>({
  editingMode: false,
  enter: () => {},
  exit: () => true,
  markDirty: () => {},
  dirtyCount: 0,
});

export function useEditMode() {
  return useContext(EditModeContext);
}

export function EditModeProvider({ children }: { children: React.ReactNode }) {
  const [editingMode, setEditingMode] = useState(false);
  const [dirtyKeys, setDirtyKeys] = useState<Record<string, boolean>>({});

  const value = useMemo<EditModeContextValue>(
    () => ({
      editingMode,
      enter: () => setEditingMode(true),
      exit: () => {
        const hasDirty = Object.values(dirtyKeys).some(Boolean);
        if (
          hasDirty &&
          !window.confirm("有卡片尚未保存修改，退出将丢弃这些改动，确定退出编辑模式？")
        ) {
          return false;
        }
        setDirtyKeys({});
        setEditingMode(false);
        return true;
      },
      markDirty: (key, dirty) => {
        setDirtyKeys((prev) => {
          const next = { ...prev };
          if (dirty) {
            next[key] = true;
          } else {
            delete next[key];
          }
          return next;
        });
      },
      dirtyCount: Object.keys(dirtyKeys).length,
    }),
    [editingMode, dirtyKeys],
  );

  return (
    <EditModeContext.Provider value={value}>{children}</EditModeContext.Provider>
  );
}

export function EditModeToggle() {
  const { editingMode, enter, exit } = useEditMode();
  if (!editingMode) {
    return (
      <button className="button edit-mode-toggle" type="button" onClick={enter}>
        <PencilLine aria-hidden="true" size={16} />
        编辑模式
      </button>
    );
  }
  return (
    <button className="button edit-mode-toggle edit-mode-exit" type="button" onClick={exit}>
      退出编辑模式
    </button>
  );
}

export function EditModeBanner() {
  const { editingMode, dirtyCount } = useEditMode();
  if (!editingMode) return null;
  return (
    <div className="edit-mode-banner" role="status">
      <strong>编辑模式：</strong>修改按卡片分区保存，保存后该卡恢复展示；退出前请完成保存
      {dirtyCount ? <span className="edit-mode-banner-dirty">（{dirtyCount} 张卡片有未保存修改）</span> : null}
    </div>
  );
}
