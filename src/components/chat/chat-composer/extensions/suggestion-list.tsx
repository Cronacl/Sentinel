"use client";

import { ScrollShadow } from "@heroui/react";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { createPortal } from "react-dom";
import {
  File02Icon,
  Folder01Icon,
  FlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export type SuggestionItem = {
  description?: string;
  icon?: "file" | "directory" | "skill";
  id: string;
  label: string;
  sublabel?: string;
};

export type SuggestionListRef = {
  onKeyDown: (event: KeyboardEvent) => boolean;
};

type SuggestionListProps = {
  clientRect?: (() => DOMRect | null) | null;
  command: (item: SuggestionItem) => void;
  items: SuggestionItem[];
  title?: string;
};

function getIcon(icon: SuggestionItem["icon"]) {
  switch (icon) {
    case "directory":
      return Folder01Icon;
    case "skill":
      return FlashIcon;
    default:
      return File02Icon;
  }
}

export const SuggestionList = forwardRef<
  SuggestionListRef,
  SuggestionListProps
>(function SuggestionList({ clientRect, command, items, title }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowUp") {
        setSelectedIndex((current) =>
          current <= 0 ? items.length - 1 : current - 1,
        );
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((current) =>
          current >= items.length - 1 ? 0 : current + 1,
        );
        return true;
      }
      if (event.key === "Enter") {
        const item = items[selectedIndex];
        if (item) {
          command(item);
        }
        return true;
      }
      if (event.key === "Escape") {
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return null;
  }

  const rect = clientRect?.();
  if (!rect) {
    return null;
  }

  const viewportPadding = 12;
  const popupGap = 10;
  const availableAbove = rect.top - viewportPadding - popupGap;
  const maxHeight = Math.min(240, Math.max(88, availableAbove));
  const pinToTop = availableAbove < 88;

  const style: React.CSSProperties = {
    left: rect.left,
    maxHeight,
    position: "fixed",
    top: pinToTop ? viewportPadding : rect.top - popupGap,
    transform: pinToTop ? undefined : "translateY(-100%)",
    zIndex: 200,
  };

  return createPortal(
    <div className="sentinel-suggestion-popup" style={style}>
      {title ? (
        <div className="px-3 pb-1 pt-2 text-[11px] font-medium text-muted">
          {title}
        </div>
      ) : null}
      <ScrollShadow
        className="sentinel-suggestion-scroll"
        orientation="vertical"
        style={{ maxHeight }}
      >
        {items.map((item, index) => (
          <button
            className={`sentinel-suggestion-item ${item.icon === "skill" || item.icon === "file" || item.icon === "directory" ? "sentinel-suggestion-item--stacked" : ""} ${index === selectedIndex ? "is-selected" : ""}`}
            key={item.id}
            onClick={() => command(item)}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            <HugeiconsIcon
              className="sentinel-suggestion-item-icon shrink-0"
              color="currentColor"
              icon={getIcon(item.icon)}
              size={14}
              strokeWidth={1.5}
            />
            <span className="sentinel-suggestion-item-copy">
              <span className="sentinel-suggestion-item-title">
                {item.label}
              </span>
              {item.sublabel ? (
                <span
                  className={`sentinel-suggestion-item-sub ${item.icon === "skill" || item.icon === "file" || item.icon === "directory" ? "sentinel-suggestion-item-sub--multiline" : ""}`}
                >
                  {item.sublabel}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </ScrollShadow>
    </div>,
    document.body,
  );
});
