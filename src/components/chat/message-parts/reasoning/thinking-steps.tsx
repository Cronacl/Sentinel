"use client";

import { forwardRef, type ReactNode } from "react";
import {
  Accordion,
  cn,
  type AccordionPanelProps,
  type AccordionRootProps,
  type AccordionTriggerProps,
} from "@heroui/react";
import { motion } from "motion/react";

type StepStatus = "complete" | "active" | "pending";

interface ThinkingStepsProps extends Omit<
  AccordionRootProps,
  "children" | "expandedKeys" | "defaultExpandedKeys" | "onExpandedChange"
> {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

const THINKING_STEP_KEY = "thinking";

const ThinkingSteps = forwardRef<HTMLDivElement, ThinkingStepsProps>(
  (
    { defaultOpen = true, open, onOpenChange, children, className, ...props },
    ref,
  ) => {
    const isControlled = open !== undefined;
    const expandedKeys = open ? [THINKING_STEP_KEY] : [];
    const defaultExpandedKeys = defaultOpen ? [THINKING_STEP_KEY] : [];

    return (
      <Accordion.Root
        ref={ref}
        allowsMultipleExpanded={false}
        className={cn("w-full max-w-full", className)}
        hideSeparator
        {...(isControlled ? { expandedKeys } : { defaultExpandedKeys })}
        onExpandedChange={
          onOpenChange
            ? (keys) => onOpenChange(keys.has(THINKING_STEP_KEY))
            : undefined
        }
        {...props}
      >
        <Accordion.Item id={THINKING_STEP_KEY} className="border-none">
          {children}
        </Accordion.Item>
      </Accordion.Root>
    );
  },
);
ThinkingSteps.displayName = "ThinkingSteps";

interface ThinkingStepsHeaderProps extends Omit<
  AccordionTriggerProps,
  "children"
> {
  children?: ReactNode;
}

const ThinkingStepsHeader = forwardRef<
  HTMLButtonElement,
  ThinkingStepsHeaderProps
>(({ children = "Thinking", className, ...props }, ref) => {
  return (
    <Accordion.Heading className="w-fit">
      <Accordion.Trigger
        ref={ref}
        className={cn(
          "min-h-6 w-auto min-w-0 appearance-none gap-1.5 rounded-none bg-transparent px-0 py-0.5 text-left text-xs font-medium leading-5 text-foreground/60 shadow-none transition-colors hover:bg-transparent hover:text-foreground data-[pressed=true]:bg-transparent",
          "[&_[data-slot=accordion-indicator]]:size-3 [&_[data-slot=accordion-indicator]]:text-foreground/40",
          className,
        )}
        {...props}
      >
        {children}
        <Accordion.Indicator />
      </Accordion.Trigger>
    </Accordion.Heading>
  );
});
ThinkingStepsHeader.displayName = "ThinkingStepsHeader";

interface ThinkingStepsContentProps extends Omit<
  AccordionPanelProps,
  "children"
> {
  children: ReactNode;
}

const ThinkingStepsContent = forwardRef<
  HTMLDivElement,
  ThinkingStepsContentProps
>(({ children, className, ...props }, ref) => {
  return (
    <Accordion.Panel {...props}>
      <Accordion.Body className={cn("flex flex-col pt-1", className)} ref={ref}>
        {children}
      </Accordion.Body>
    </Accordion.Panel>
  );
});
ThinkingStepsContent.displayName = "ThinkingStepsContent";

interface ThinkingStepProps {
  showIcon?: boolean;
  label: string;
  description?: string;
  status?: StepStatus;
  index: number;
  delay?: number;
  isLast?: boolean;
  shouldAnimate?: boolean;
  children?: ReactNode;
  className?: string;
}

function ThinkingStep({
  showIcon = true,
  label,
  description,
  status = "complete",
  index,
  delay = 0,
  isLast = false,
  shouldAnimate = false,
  children,
  className,
}: ThinkingStepProps) {
  if (status === "pending") return null;

  const isActive = status === "active";
  const content = (
    <div className="flex gap-2.5 rounded-md px-2 py-1.5">
      <div className="flex w-[14px] shrink-0 flex-col items-center">
        <div className="pt-0.5">
          {showIcon ? (
            <div className="flex h-[14px] w-[14px] items-center justify-center rounded-full border border-foreground/20">
              <div className="h-1.5 w-1.5 rounded-full bg-foreground/45" />
            </div>
          ) : (
            <div className="flex h-[14px] w-[14px] items-center justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-foreground/45" />
            </div>
          )}
        </div>
        {!isLast ? <div className="mt-1 w-px flex-1 bg-border/60" /> : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          className={cn(
            "text-[13px] font-medium leading-tight text-foreground/85",
            isActive && "sentinel-thinking-shimmer",
          )}
        >
          {label}
          {isActive ? "..." : null}
        </span>
        {description ? (
          <span className="whitespace-pre-wrap text-[13px] leading-snug text-foreground/50">
            {description}
          </span>
        ) : null}
        {children}
      </div>
    </div>
  );

  if (!shouldAnimate) {
    return (
      <div className={cn("relative z-10 overflow-hidden", className)}>
        {content}
      </div>
    );
  }

  return (
    <motion.div
      animate={{ height: "auto" }}
      className={cn("relative z-10 overflow-hidden", className)}
      initial={{ height: 0 }}
      transition={{
        duration: 0.24,
        delay: delay + index * 0.02,
        ease: "easeOut",
      }}
    >
      <motion.div
        animate={{ opacity: 1 }}
        initial={{ opacity: 0 }}
        transition={{ duration: 0.18, delay: delay + 0.06, ease: "easeOut" }}
      >
        {content}
      </motion.div>
    </motion.div>
  );
}
ThinkingStep.displayName = "ThinkingStep";

export {
  ThinkingSteps,
  ThinkingStepsHeader,
  ThinkingStepsContent,
  ThinkingStep,
};
export type {
  StepStatus,
  ThinkingStepProps,
  ThinkingStepsContentProps,
  ThinkingStepsHeaderProps,
  ThinkingStepsProps,
};
