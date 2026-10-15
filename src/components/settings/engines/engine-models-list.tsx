"use client";

import { Chip, Disclosure, DisclosureGroup } from "@heroui/react";
import { useState } from "react";

import { EngineIcon } from "@/components/engines/descriptors";
import type {
  EngineModel,
  EngineSnapshot,
} from "@/lib/ai/chat/engines/contract";

function ModelChips({ model }: { model: EngineModel }) {
  const chips: string[] = [...model.inputModalities];
  if (model.contextWindow) {
    chips.push(`${(model.contextWindow / 1000).toFixed(0)}k`);
  }
  for (const option of model.options) {
    if (option.type !== "select" || option.choices.length === 0) {
      continue;
    }
    chips.push(
      option.role === "reasoning"
        ? `${option.choices.length} efforts`
        : `${option.choices.length} ${option.label.toLowerCase()}s`,
    );
  }

  return (
    <div className="flex shrink-0 gap-1">
      {chips.map((chip, index) => (
        <Chip key={`${chip}-${index}`} size="sm" variant="soft">
          {chip}
        </Chip>
      ))}
    </div>
  );
}

/** Each instance's reported models, one disclosure per instance. */
export function EngineModelsList({
  snapshots,
}: {
  snapshots: EngineSnapshot[];
}) {
  const [expanded, setExpanded] = useState<Set<string | number>>(new Set());
  const withModels = snapshots.filter((snapshot) => snapshot.models.length > 0);

  if (withModels.length === 0) {
    return null;
  }

  return (
    <DisclosureGroup
      allowsMultipleExpanded
      expandedKeys={expanded}
      onExpandedChange={setExpanded}
    >
      <div className="border-separator/20 bg-surface divide-separator/20 divide-y rounded-2xl border">
        {withModels.map((snapshot) => (
          <Disclosure
            id={`runtime-${snapshot.instanceId}`}
            key={snapshot.instanceId}
          >
            <Disclosure.Heading>
              <Disclosure.Trigger className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/80">
                  <EngineIcon
                    className="h-3.5 w-3.5"
                    driver={snapshot.driver}
                    iconUrl={snapshot.iconUrl}
                  />
                </div>
                <span className="text-foreground text-[13px] font-medium">
                  {snapshot.label} Models
                </span>
                <Chip size="sm" variant="soft">
                  {snapshot.models.length}
                </Chip>
                <Disclosure.Indicator className="ml-auto" />
              </Disclosure.Trigger>
            </Disclosure.Heading>
            <Disclosure.Content>
              <Disclosure.Body>
                <div className="divide-separator/10 divide-y px-3 pb-2">
                  {snapshot.models.map((model) => (
                    <div
                      className="flex items-center gap-2.5 py-1.5 pl-9"
                      key={model.id}
                    >
                      <span className="text-foreground shrink-0 text-[13px]">
                        {model.name}
                      </span>
                      {model.isDefault ? (
                        <Chip color="accent" size="sm" variant="soft">
                          Default
                        </Chip>
                      ) : null}
                      <span className="text-muted min-w-0 flex-1 truncate text-[11px]">
                        {model.description}
                      </span>
                      <ModelChips model={model} />
                    </div>
                  ))}
                </div>
              </Disclosure.Body>
            </Disclosure.Content>
          </Disclosure>
        ))}
      </div>
    </DisclosureGroup>
  );
}
