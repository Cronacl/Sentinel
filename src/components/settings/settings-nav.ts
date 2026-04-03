import {
  AiIdeaIcon,
  Brain02Icon,
  BrushIcon,
  Database01Icon,
  GlobalSearchIcon,
  IceCubesIcon,
  Image01Icon,
  McpServerIcon,
  RefreshIcon,
  Settings05Icon,
  ShieldUserIcon,
  TestTubeIcon,
  UserCircleIcon,
  ValidationApprovalIcon,
} from "@hugeicons/core-free-icons";

export const SETTINGS_NAV = [
  { href: "/settings", label: "General", icon: Settings05Icon },
  {
    href: "/settings/appearance",
    label: "Appearance",
    icon: BrushIcon,
  },
  {
    href: "/settings/personalization",
    label: "Personalization",
    icon: UserCircleIcon,
  },
  {
    href: "/settings/approvals",
    label: "Approvals",
    icon: ValidationApprovalIcon,
  },
  {
    href: "/settings/search",
    label: "Search",
    icon: GlobalSearchIcon,
  },
  {
    href: "/settings/images",
    label: "Images",
    icon: Image01Icon,
  },
  { href: "/settings/integrations", label: "Integrations", icon: IceCubesIcon },
  { href: "/settings/mcp", label: "MCP Servers", icon: McpServerIcon },
  {
    href: "/settings/memory",
    label: "Memory",
    icon: AiIdeaIcon,
  },
  { href: "/settings/security", label: "Security", icon: ShieldUserIcon },
  { href: "/settings/updates", label: "Updates", icon: RefreshIcon },
  { href: "/settings/providers", label: "Providers", icon: TestTubeIcon },
  { href: "/settings/models", label: "Models", icon: Brain02Icon },
  { href: "/settings/data", label: "Data", icon: Database01Icon },
] as const;
