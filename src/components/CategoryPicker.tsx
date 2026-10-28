"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Custom category menu — native <select> often fails to open inside overflow
 * scroll containers on mobile / some browsers.
 */
export default function CategoryPicker({
  categories,
  value,
  onChange,
  onAddCategory,
  disabled = false,
}: {
  categories: string[];
  value: string;
  onChange: (value: string) => void;
  onAddCategory: (name: string) => Promise<void> | void;
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  function updateMenuPos() {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuHeight = Math.min(320, 44 + categories.length * 40 + 48);
    const openUp = spaceBelow < menuHeight && rect.top > spaceBelow;
    setMenuPos({
      top: openUp ? Math.max(8, rect.top - menuHeight - 4) : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }

  useEffect(() => {
    if (!open) return;
    updateMenuPos();
    function onDoc(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        const menu = document.getElementById(listId);
        if (menu && menu.contains(target)) return;
        setOpen(false);
        setAdding(false);
        setNewName("");
      }
    }
    function onScrollOrResize() {
      updateMenuPos();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listId stable; refresh pos on open/categories
  }, [open, categories.length, listId]);

  async function saveNew() {
    const name = newName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      await onAddCategory(name);
      setAdding(false);
      setNewName("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const label = value || "-- Select --";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (open) {
            setOpen(false);
            setAdding(false);
            setNewName("");
            return;
          }
          updateMenuPos();
          setOpen(true);
        }}
        className="flex h-10 w-full items-center justify-between rounded-[2px] border border-[#c6c6c6] bg-white px-3 text-left text-sm outline-none hover:border-[#999] focus:border-[#4c00ff] disabled:opacity-50"
      >
        <span className={value ? "text-[#212121]" : "text-[#888]"}>{label}</span>
        <span className="ml-2 text-[10px] text-[#666]" aria-hidden>
          ▼
        </span>
      </button>

      {open && menuPos ? (
        <div
          id={listId}
          role="listbox"
          className="fixed z-[200] max-h-[min(70vh,320px)] overflow-y-auto rounded-[2px] border border-[#c6c6c6] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,.18)]"
          style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
        >
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className={`flex w-full px-3 py-2.5 text-left text-sm hover:bg-[#f5f3ff] ${
              !value ? "bg-[#f0ebff] font-semibold text-[#4c00ff]" : "text-[#212121]"
            }`}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            -- Select --
          </button>
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              role="option"
              aria-selected={value === item}
              className={`flex w-full px-3 py-2.5 text-left text-sm hover:bg-[#f5f3ff] ${
                value === item ? "bg-[#f0ebff] font-semibold text-[#4c00ff]" : "text-[#212121]"
              }`}
              onClick={() => {
                onChange(item);
                setOpen(false);
              }}
            >
              {item}
            </button>
          ))}
          <div className="border-t border-[#eee]">
            {adding ? (
              <div className="flex gap-2 p-2">
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="New category name"
                  className="h-9 flex-1 rounded-[2px] border border-[#c6c6c6] px-2 text-sm"
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void saveNew();
                    }
                    if (event.key === "Escape") {
                      setAdding(false);
                      setNewName("");
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveNew()}
                  className="rounded-[2px] bg-[#4c00ff] px-3 text-[12px] font-semibold text-white disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="flex w-full px-3 py-2.5 text-left text-sm font-semibold text-[#4c00ff] hover:bg-[#f5f3ff]"
                onClick={() => setAdding(true)}
              >
                + Add category…
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
