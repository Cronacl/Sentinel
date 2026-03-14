"use client";

import { useEffect, useRef, type RefObject } from "react";

type OutsideClickTarget = {
  enabled?: boolean;
  onOutsideClick: () => void;
  ref: RefObject<HTMLElement | null>;
};

export function useOutsideClick(targets: OutsideClickTarget[]) {
  const targetsRef = useRef(targets);

  targetsRef.current = targets;

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      for (const target of targetsRef.current) {
        if (target.enabled === false) {
          continue;
        }

        const element = target.ref.current;
        if (element && !element.contains(event.target)) {
          target.onOutsideClick();
        }
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);
}
