import { AppShell } from "@/components/shell";

export default function AppLayout({
  children,
  settings,
}: {
  children: React.ReactNode;
  settings: React.ReactNode;
}) {
  return (
    <AppShell>
      {children}
      {settings}
    </AppShell>
  );
}
