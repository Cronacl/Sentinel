import Link from "next/link";

type LogoProps = {
  className?: string;
  label?: string;
  showText?: boolean;
  textClassName?: string;
};

type SentinelLogoMarkProps = {
  className?: string;
};

export function SentinelLogoMark({ className }: SentinelLogoMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={`fill-current ${className ?? ""}`}
      fill="none"
      viewBox="0 0 201 200"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#sentinel-logo-clip)">
        <path d="M91.9711 91.6947C236.385 236.108 -35.8253 236.108 108.582 91.6947C-35.832 236.108 -35.832 -36.1018 108.582 108.305C-35.832 -36.1084 236.378 -36.1084 91.9711 108.305C236.385 -36.1084 236.385 236.102 91.9711 91.6947Z" />
      </g>
      <defs>
        <clipPath id="sentinel-logo-clip">
          <rect height="200" transform="translate(0.276367)" width="200" />
        </clipPath>
      </defs>
    </svg>
  );
}

type SentinelLogoBadgeProps = {
  className?: string;
  markClassName?: string;
};

export function SentinelLogoBadge(props: SentinelLogoBadgeProps) {
  return (
    <div
      className={`flex items-center justify-center rounded-[1.75rem] ${props.className ?? ""}`}
    >
      <SentinelLogoMark className={props.markClassName ?? "h-7 w-7"} />
    </div>
  );
}

export default function Logo(props: LogoProps) {
  return (
    <Link
      className={`flex w-fit items-center justify-center gap-3 ${props.className ?? ""}`}
      href="/"
    >
      <SentinelLogoMark className="h-8 w-8" />
      {props.showText ? (
        <span className={props.textClassName ?? "text-2xl font-medium"}>
          {props.label ?? "Sentinel"}
        </span>
      ) : null}
    </Link>
  );
}
