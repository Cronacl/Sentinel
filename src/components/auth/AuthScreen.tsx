"use client";

import { Button, Card } from "@heroui/react";
import { ComputerIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "next/navigation";

import Logo from "@/components/shared/logo";

type AuthScreenProps = {
  alternateHref: string;
  alternateLabel: string;
  description: string;
  title: string;
};

export function AuthScreen(props: AuthScreenProps) {
  const router = useRouter();

  return (
    <main className="bg-background text-foreground relative min-h-screen overflow-hidden px-4 py-6">
      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-sm items-center justify-center">
        <Card className="p-8">
          <Card.Header className="items-center space-y-3 py-1 text-center">
            <Logo className="text-foreground" />
            <div className="space-y-1.5">
              <Card.Title className="text-foreground text-xl">
                {props.title}
              </Card.Title>
              <Card.Description className="text-muted max-w-xs text-sm">
                {props.description}
              </Card.Description>
            </div>
          </Card.Header>
          <Card.Content className="space-y-3">
            <div className="bg-default rounded-2xl px-4 py-4 text-left">
              <div className="mb-2 flex items-center gap-2">
                <HugeiconsIcon
                  color="currentColor"
                  icon={ComputerIcon}
                  size={16}
                  strokeWidth={1.5}
                />
                <span className="text-sm font-medium">Local desktop mode</span>
              </div>
              <p className="text-muted text-sm">
                Sentinel now runs with a single local profile. Open the app
                directly and use the desktop runtime for local folders,
                services, and threads.
              </p>
            </div>

            <Button className="w-full text-sm" onPress={() => router.push("/")}>
              Continue to Sentinel
            </Button>
          </Card.Content>
        </Card>
      </div>
    </main>
  );
}
