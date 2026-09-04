"use client";

import { PencilLine } from "lucide-react";
import { createContext, useContext, useMemo, useState } from "react";
import { useT, useTv } from "@/lib/i18n/locale-context";

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
  const t = useT();

  const value = useMemo<EditModeContextValue>(
    () => ({
      editingMode,
      enter: () => setEditingMode(true),
      exit: () => {
        const hasDirty = Object.values(dirtyKeys).some(Boolean);
        if (
          hasDirty &&
          !window.confirm(
            t("有卡片尚未保存修改，退出将丢弃这些改动，确定退出编辑模式？")
          )
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
    [editingMode, dirtyKeys, t],
  );

  return (
    <EditModeContext.Provider value={value}>{children}</EditModeContext.Provider>
  );
}

export function EditModeToggle() {
  const { editingMode, enter, exit } = useEditMode();
  const t = useT();
  if (!editingMode) {
    return (
      <button className="button edit-mode-toggle" type="button" onClick={enter}>
        <PencilLine aria-hidden="true" size={16} />
        {t("编辑模式")}
      </button>
    );
  }
  return (
    <button className="button edit-mode-toggle edit-mode-exit" type="button" onClick={exit}>
      {t("退出编辑模式")}
    </button>
  );
}

export function EditModeBanner() {
  const { editingMode, dirtyCount } = useEditMode();
  const t = useT();
  const tv = useTv();
  if (!editingMode) return null;
  return (
    <div className="edit-mode-banner" role="status">
      <strong>{t("编辑模式：")}</strong>
      {t("修改按卡片分区保存，保存后该卡恢复展示；退出前请完成保存")}
      {dirtyCount ? (
        <span className="edit-mode-banner-dirty">
          {tv("（{n} 张卡片有未保存修改）", { n: dirtyCount })}
        </span>
      ) : null}
    </div>
  );
}
