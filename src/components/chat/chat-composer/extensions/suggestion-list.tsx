"use client";

import {
  File02Icon,
  FlashIcon,
  Folder01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Icon } from "@iconify/react";
import { ScrollShadow } from "@heroui/react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { SkillIcon } from "@/components/skills/skill-icon";

export type SuggestionItem = {
  description?: string;
  execute?: () => void;
  group?: "app" | "provider" | "skill";
  icon?: "file" | "directory" | "skill" | "command";
  id: string;
  kind?:
    | "app-command"
    | "directory"
    | "file"
    | "path"
    | "provider-command"
    | "skill";
  label: string;
  meta?: string;
  skillIcon?: string | null;
  sublabel?: string;
};

export type SuggestionListRef = {
  onKeyDown: (event: KeyboardEvent) => boolean;
};

type SuggestionPopupLayout = {
  left: number;
  maxHeight: number;
  placement: "above" | "below";
  top: number;
};

type SuggestionListProps = {
  clientRect?: (() => DOMRect | null) | null;
  command: (item: SuggestionItem) => void;
  items: SuggestionItem[];
  onKeyDownHandlerChange?: (
    handler: ((event: KeyboardEvent) => boolean) | null,
  ) => void;
  title?: string;
  variant: "command" | "path" | "skill";
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

function getGroupLabel(group: SuggestionItem["group"]) {
  switch (group) {
    case "app":
      return "App";
    case "provider":
      return "Harness";
    case "skill":
      return "Skills";
    default:
      return null;
  }
}

function renderItemIcon(item: SuggestionItem) {
  const className = `sentinel-suggestion-item-icon shrink-0 ${
    item.kind === "skill" ? "sentinel-suggestion-item-icon--skill" : ""
  } ${
    item.kind === "app-command" || item.kind === "provider-command"
      ? "sentinel-suggestion-item-icon--command"
      : ""
  }`;

  if (item.kind === "skill") {
    return (
      <span className={className}>
        <SkillIcon
          className="h-3.5 w-3.5"
          metadataIcon={item.skillIcon}
          name={item.label}
          size={14}
        />
      </span>
    );
  }

  if (item.kind === "app-command" || item.kind === "provider-command") {
    return (
      <Icon
        className={className}
        icon={
          item.kind === "app-command"
            ? "solar:command-linear"
            : "solar:terminal-linear"
        }
      />
    );
  }

  return (
    <HugeiconsIcon
      className={className}
      color="currentColor"
      icon={getIcon(item.icon)}
      size={14}
      strokeWidth={1.5}
    />
  );
}

export const SuggestionList = forwardRef<
  SuggestionListRef,
  SuggestionListProps
>(function SuggestionList(
  { clientRect, command, items, onKeyDownHandlerChange, title, variant },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [layout, setLayout] = useState<SuggestionPopupLayout | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const maxPopupHeight = 260;

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    const selectedItem = scrollRef.current?.querySelector<HTMLElement>(
      `[data-suggestion-index="${selectedIndex}"]`,
    );

    selectedItem?.scrollIntoView({ block: "nearest" });
  }, [items, selectedIndex]);

  const updateLayout = useMemo(
    () => () => {
      const rect = clientRect?.();
      const popupEl = popupRef.current;

      if (!rect || !popupEl) {
        setLayout(null);
        return;
      }

      const viewportPadding = 12;
      const popupGap = 10;
      const minHeight = 88;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const measuredWidth = popupEl.offsetWidth || 320;
      const measuredHeight = popupEl.offsetHeight || maxPopupHeight;
      const maxLeft = Math.max(
        viewportPadding,
        viewportWidth - measuredWidth - viewportPadding,
      );
      const availableAbove = rect.top - viewportPadding - popupGap;
      const availableBelow =
        viewportHeight - rect.bottom - viewportPadding - popupGap;
      const placement =
        availableAbove >= Math.min(measuredHeight, maxPopupHeight) ||
        availableAbove > availableBelow
          ? "above"
          : "below";
      const maxHeight = Math.min(
        maxPopupHeight,
        Math.max(
          minHeight,
          placement === "above" ? availableAbove : availableBelow,
        ),
      );
      const left = Math.min(Math.max(rect.left, viewportPadding), maxLeft);
      const top =
        placement === "above"
          ? Math.max(
              viewportPadding,
              rect.top - popupGap - Math.min(measuredHeight, maxHeight),
            )
          : Math.min(
              viewportHeight -
                viewportPadding -
                Math.min(measuredHeight, maxHeight),
              rect.bottom + popupGap,
            );

      setLayout((current) => {
        if (
          current &&
          current.left === left &&
          current.maxHeight === maxHeight &&
          current.placement === placement &&
          current.top === top
        ) {
          return current;
        }

        return {
          left,
          maxHeight,
          placement,
          top,
        };
      });
    },
    [clientRect, variant],
  );

  useLayoutEffect(() => {
    updateLayout();
  }, [updateLayout, items, title, variant]);

  useEffect(() => {
    if (!clientRect) {
      return;
    }

    let frameId = 0;

    const syncLayout = () => {
      updateLayout();
      frameId = 0;
    };

    const scheduleLayout = () => {
      if (frameId) {
        return;
      }

      frameId = window.requestAnimationFrame(syncLayout);
    };

    scheduleLayout();

    window.addEventListener("resize", scheduleLayout);
    window.addEventListener("scroll", scheduleLayout, true);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleLayout);

    if (popupRef.current && resizeObserver) {
      resizeObserver.observe(popupRef.current);
    }

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      window.removeEventListener("resize", scheduleLayout);
      window.removeEventListener("scroll", scheduleLayout, true);
      resizeObserver?.disconnect();
    };
  }, [clientRect, updateLayout]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const consumeEvent = () => {
        event.preventDefault();
        event.stopPropagation();
        return true;
      };

      if (items.length === 0) {
        return ["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(event.key)
          ? consumeEvent()
          : false;
      }

      if (event.key === "ArrowUp") {
        setSelectedIndex((current) =>
          current <= 0 ? items.length - 1 : current - 1,
        );
        return consumeEvent();
      }

      if (event.key === "ArrowDown") {
        setSelectedIndex((current) =>
          current >= items.length - 1 ? 0 : current + 1,
        );
        return consumeEvent();
      }

      if (event.key === "Enter") {
        const item = items[selectedIndex];
        if (item) {
          command(item);
        }
        return consumeEvent();
      }

      if (event.key === "Escape") {
        return consumeEvent();
      }

      return false;
    },
    [command, items, selectedIndex],
  );

  useImperativeHandle(ref, () => ({
    onKeyDown: handleKeyDown,
  }));

  useLayoutEffect(() => {
    onKeyDownHandlerChange?.(handleKeyDown);
    return () => onKeyDownHandlerChange?.(null);
  }, [handleKeyDown, onKeyDownHandlerChange]);

  if (!clientRect) {
    return null;
  }

  const style: React.CSSProperties = {
    left: layout?.left ?? -9999,
    maxHeight: layout?.maxHeight ?? maxPopupHeight,
    minHeight: 0,
    opacity: layout ? 1 : 0,
    pointerEvents: layout ? "auto" : "none",
    position: "fixed",
    top: layout?.top ?? -9999,
    visibility: layout ? "visible" : "hidden",
    zIndex: 200,
  };

  return createPortal(
    <div
      className={`sentinel-suggestion-popup ${variant === "command" || variant === "skill" ? "sentinel-suggestion-popup--wide" : ""} ${layout?.placement === "below" ? "sentinel-suggestion-popup--below" : "sentinel-suggestion-popup--above"}`}
      ref={popupRef}
      style={style}
    >
      {title ? <div className="sentinel-suggestion-header">{title}</div> : null}
      <ScrollShadow
        aria-label={title ?? "Suggestions"}
        className="sentinel-suggestion-scroll"
        hideScrollBar
        orientation="vertical"
        ref={scrollRef}
        role="listbox"
        style={{ maxHeight: layout?.maxHeight ?? maxPopupHeight }}
      >
        {items.length === 0 ? (
          <div className="sentinel-suggestion-empty">No results found</div>
        ) : (
          items.map((item, index) => {
            const previous = items[index - 1];
            const groupLabel =
              item.group !== previous?.group ? getGroupLabel(item.group) : null;
            const isStacked = Boolean(item.sublabel);

            return (
              <div key={item.id}>
                {groupLabel ? (
                  <div className="sentinel-suggestion-group-label">
                    {groupLabel}
                  </div>
                ) : null}
                <button
                  aria-selected={index === selectedIndex}
                  className={`sentinel-suggestion-item ${isStacked ? "sentinel-suggestion-item--stacked" : ""} ${index === selectedIndex ? "is-selected" : ""}`}
                  data-suggestion-index={index}
                  onClick={() => command(item)}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setSelectedIndex(index)}
                  role="option"
                  type="button"
                >
                  <div className="sentinel-suggestion-item-content">
                    {renderItemIcon(item)}
                    <span className="sentinel-suggestion-item-copy">
                      <span className="sentinel-suggestion-item-title">
                        {item.label}
                      </span>
                      {item.sublabel ? (
                        <span
                          className={`sentinel-suggestion-item-sub ${isStacked ? "sentinel-suggestion-item-sub--multiline" : ""}`}
                        >
                          {item.sublabel}
                        </span>
                      ) : null}
                    </span>
                    {item.meta ? (
                      <span className="sentinel-suggestion-item-meta">
                        {item.meta}
                      </span>
                    ) : null}
                  </div>
                </button>
              </div>
            );
          })
        )}
      </ScrollShadow>
    </div>,
    document.body,
  );
});
