"use client";

import {
  ArrowDown01Icon,
  ArrowUp01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";

type ScrollButtonDirection = "down" | "up";

const SCROLL_EDGE_THRESHOLD = 72;

function getScrollMetrics(element: HTMLDivElement) {
  const { clientHeight, scrollHeight, scrollTop } = element;

  return {
    canScrollDown:
      scrollHeight - scrollTop - clientHeight > SCROLL_EDGE_THRESHOLD,
    canScrollUp: scrollTop > SCROLL_EDGE_THRESHOLD,
    scrollTop,
  };
}

export function useChatScrollControl(threadKey: string) {
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const composerDockRef = useRef<HTMLDivElement | null>(null);
  const [composerOffset, setComposerOffset] = useState(96);
  const previousScrollTopRef = useRef(0);
  const [buttonDirection, setButtonDirection] =
    useState<ScrollButtonDirection>("down");
  const [isButtonVisible, setIsButtonVisible] = useState(false);

  const syncScrollState = useCallback(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) {
      return;
    }

    const { canScrollDown, canScrollUp, scrollTop } =
      getScrollMetrics(scrollArea);
    const delta = scrollTop - previousScrollTopRef.current;

    previousScrollTopRef.current = scrollTop;

    if (!canScrollDown && !canScrollUp) {
      setIsButtonVisible(false);
      return;
    }

    setIsButtonVisible(true);
    setButtonDirection((currentDirection) => {
      if (delta < -2 && canScrollDown) {
        return "down";
      }

      if (delta > 2 && canScrollUp) {
        return "up";
      }

      if (!canScrollDown && canScrollUp) {
        return "up";
      }

      if (!canScrollUp && canScrollDown) {
        return "down";
      }

      return currentDirection;
    });
  }, []);

  const jump = useCallback(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) {
      return;
    }

    scrollArea.scrollTo({
      top: buttonDirection === "down" ? scrollArea.scrollHeight : 0,
      behavior: "smooth",
    });
  }, [buttonDirection]);

  useEffect(() => {
    const composerDock = composerDockRef.current;
    if (!composerDock) {
      return;
    }

    const updateOffset = () => {
      setComposerOffset(composerDock.offsetHeight + 16);
    };

    updateOffset();

    const observer = new ResizeObserver(() => {
      updateOffset();
    });

    observer.observe(composerDock);

    return () => {
      observer.disconnect();
    };
  }, [threadKey]);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) {
      return;
    }

    const sync = () => syncScrollState();

    sync();
    scrollArea.addEventListener("scroll", sync, { passive: true });

    return () => {
      scrollArea.removeEventListener("scroll", sync);
    };
  }, [syncScrollState, threadKey]);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      scrollArea.scrollTo({
        top: scrollArea.scrollHeight,
        behavior: "auto",
      });
      previousScrollTopRef.current = scrollArea.scrollTop;
      syncScrollState();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [syncScrollState, threadKey]);

  return {
    buttonDirection,
    composerDockRef,
    composerOffset,
    isButtonVisible,
    jump,
    scrollAreaRef,
  };
}

export function ChatScrollControl({
  bottomOffset,
  direction,
  isVisible,
  onClick,
}: {
  bottomOffset: number;
  direction: ScrollButtonDirection;
  isVisible: boolean;
  onClick: () => void;
}) {
  if (!isVisible) {
    return null;
  }

  return (
    <button
      aria-label={direction === "down" ? "Scroll to latest" : "Scroll to top"}
      className="absolute left-1/2 z-40 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-muted/20 bg-surface text-muted shadow-sm backdrop-blur-md transition-colors hover:text-foreground"
      onClick={onClick}
      style={{ bottom: bottomOffset }}
      type="button"
    >
      <HugeiconsIcon
        color="currentColor"
        icon={direction === "down" ? ArrowDown01Icon : ArrowUp01Icon}
        size={14}
        strokeWidth={1.75}
      />
    </button>
  );
}
