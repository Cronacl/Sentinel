import type { PropsWithChildren, ReactNode } from "react";

interface SettingsPageWrapperProps extends PropsWithChildren {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function SettingsPageWrapper({
  title,
  subtitle,
  actions,
  children,
}: SettingsPageWrapperProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-10 py-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-foreground text-xl font-medium tracking-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="text-muted mt-1 text-sm">{subtitle}</p>
              )}
            </div>
            {actions && (
              <div className="flex shrink-0 items-center gap-2">{actions}</div>
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
