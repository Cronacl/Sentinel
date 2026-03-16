"use client";

import type { SVGProps } from "react";
import { Icon } from "@iconify/react";
import type { IntegrationProvider } from "@/server/db/enums";

const LinearIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 100 100"
    {...props}
  >
    <path
      fill="#5E6AD2"
      d="M1.225 61.523c-.222-.949.908-1.546 1.597-.857l36.512 36.512c.69.69.092 1.82-.857 1.597-18.425-4.323-32.93-18.827-37.252-37.252ZM.002 46.889a.99.99 0 0 0 .29.76L52.35 99.71c.201.2.478.307.76.29 2.37-.149 4.695-.46 6.963-.927.765-.157 1.03-1.096.478-1.648L2.576 39.448c-.552-.551-1.491-.286-1.648.479a50.067 50.067 0 0 0-.926 6.962ZM4.21 29.705a.988.988 0 0 0 .208 1.1l64.776 64.776c.289.29.726.375 1.1.208a49.908 49.908 0 0 0 5.185-2.684.981.981 0 0 0 .183-1.54L8.436 24.336a.981.981 0 0 0-1.541.183 49.896 49.896 0 0 0-2.684 5.185Zm8.448-11.631a.986.986 0 0 1-.045-1.354C21.78 6.46 35.111 0 49.952 0 77.592 0 100 22.407 100 50.048c0 14.84-6.46 28.172-16.72 37.338a.986.986 0 0 1-1.354-.045L12.659 18.074Z"
    />
  </svg>
);

const GithubIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
    className={`fill-black dark:fill-white ${props.className ?? ""}`}
  >
    <g clipPath="url(#gh-clip)">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.81 6.05 12.6C6.12 12.08 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8.02 3.86C8.7 3.86 9.38 3.95 10.02 4.13C11.55 3.09 12.22 3.31 12.22 3.31C12.66 4.41 12.38 5.23 12.3 5.43C12.81 5.99 13.12 6.7 13.12 7.58C13.12 10.65 11.25 11.33 9.47 11.53C9.76 11.78 10.01 12.26 10.01 13.01C10.01 14.08 10 14.94 10 15.21C10 15.42 10.15 15.67 10.55 15.59C12.1381 15.0539 13.5182 14.0332 14.4958 12.6716C15.4735 11.3101 15.9996 9.6762 16 8C16 3.58 12.42 0 8 0Z"
      />
    </g>
    <defs>
      <clipPath id="gh-clip">
        <rect width="16" height="16" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

type IconifyProvider = {
  type: "iconify";
  icon: string;
  darkInvert?: boolean;
};

type SvgProvider = {
  type: "svg";
  component: React.ComponentType<SVGProps<SVGSVGElement>>;
};

type ProviderIconDef = IconifyProvider | SvgProvider;

const PROVIDER_ICONS: Record<IntegrationProvider, ProviderIconDef> = {
  gmail: { type: "iconify", icon: "logos:google-gmail" },
  google_calendar: { type: "iconify", icon: "logos:google-calendar" },
  google_drive: { type: "iconify", icon: "logos:google-drive" },
  slack: { type: "iconify", icon: "logos:slack-icon" },
  notion: { type: "iconify", icon: "logos:notion-icon" },
  github: { type: "svg", component: GithubIcon },
  linear: { type: "svg", component: LinearIcon },
  postgresql: { type: "iconify", icon: "logos:postgresql" },
  mysql: { type: "iconify", icon: "logos:mysql-icon" },
  mongodb: { type: "iconify", icon: "logos:mongodb-icon" },
};

type IntegrationProviderIconProps = {
  provider: IntegrationProvider | string;
  className?: string;
};

export function IntegrationProviderIcon({
  provider,
  className = "h-5 w-5",
}: IntegrationProviderIconProps) {
  const def = PROVIDER_ICONS[provider as IntegrationProvider];

  if (!def) {
    return <Icon icon="solar:plug-circle-line-duotone" className={className} />;
  }

  if (def.type === "iconify") {
    return <Icon icon={def.icon} className={className} />;
  }

  const SvgComponent = def.component;
  return <SvgComponent className={className} />;
}

export function getIntegrationProviderIconNode(
  provider: string,
  className = "h-5 w-5",
) {
  return <IntegrationProviderIcon provider={provider} className={className} />;
}
