"use client";

import { cn } from "@heroui/react";
import { useId, useMemo, type SVGProps } from "react";

import type { DesktopOpenTarget } from "@/lib/desktop/contracts";

import { XCODE_OPEN_SVG } from "./xcode-open-asset";

const CUSTOM_OPEN_TARGET_IDS = new Set([
  "android-studio",
  "cursor",
  "finder",
  "ghostty",
  "xcode",
  "zed",
]);

export function isCustomOpenTargetGlyph(id: string): boolean {
  return CUSTOM_OPEN_TARGET_IDS.has(id);
}

function CursorOpenIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      aria-hidden
      viewBox="0 0 466.73 532.09"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ZedOpenIcon(props: SVGProps<SVGSVGElement>) {
  const uid = useId().replace(/:/g, "");
  const clipId = `${uid}-zed-clip`;

  return (
    <svg
      {...props}
      aria-hidden
      fill="none"
      viewBox="0 0 96 96"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath={`url(#${clipId})`}>
        <path
          clipRule="evenodd"
          d="M9 6a3 3 0 0 0-3 3v66H0V9a9 9 0 0 1 9-9h80.379c4.009 0 6.016 4.847 3.182 7.682L43.055 57.187H57V51h6v7.688a4.5 4.5 0 0 1-4.5 4.5H37.055L26.743 73.5H73.5V36h6v37.5a6 6 0 0 1-6 6H20.743L10.243 90H87a3 3 0 0 0 3-3V21h6v66a9 9 0 0 1-9 9H6.621c-4.009 0-6.016-4.847-3.182-7.682L52.757 39H39v6h-6v-7.5a4.5 4.5 0 0 1 4.5-4.5h21.257l10.5-10.5H22.5V60h-6V22.5a6 6 0 0 1 6-6h52.757L85.757 6H9Z"
          fill="currentColor"
          fillRule="evenodd"
        />
      </g>
      <defs>
        <clipPath id={clipId}>
          <path d="M0 0h96v96H0z" fill="#fff" />
        </clipPath>
      </defs>
    </svg>
  );
}

function FinderOpenIcon(props: SVGProps<SVGSVGElement>) {
  const uid = useId().replace(/:/g, "");
  const gidA = `${uid}-finder-a`;
  const gidB = `${uid}-finder-b`;

  return (
    <svg
      {...props}
      aria-hidden
      role="img"
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill={`url(#${gidA})`} height={512} rx="15%" width={512} />
      <defs>
        <linearGradient id={gidA} x2={0} y1="100%">
          <stop offset={0} stopColor="#1e73f2" />
          <stop offset={1} stopColor="#19d3fd" />
        </linearGradient>
        <linearGradient id={gidB} x2={0} y1="100%">
          <stop offset={0} stopColor="#dbe9f4" />
          <stop offset={1} stopColor="#f7f6f6" />
        </linearGradient>
      </defs>
      <path
        d="M435.2 0H274.4c-21.2 49.2-59.2 129.6-60.8 283.4a9.9 9.9 0 0010 10.1h58.7a9.9 9.9 0 019.9 10.2A933.3 933.3 0 00311.3 512h123.9a76.8 76.8 0 0076.8-76.8V76.8A76.8 76.8 0 00435.2 0z"
        fill={`url(#${gidB})`}
      />
      <path
        d="M371 149v34m-229-34v34m263.4 147.2a215.2 215.2 0 01-298.8 0"
        fill="none"
        stroke="#000"
        strokeLinecap="round"
        strokeWidth={20}
      />
    </svg>
  );
}

function AndroidStudioOpenIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      aria-hidden
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M51.3 17.7H23.2C17.6 17.7 13 22.3 13 28c-.2 5.5 4.2 10.1 9.7 10.3h28.9l-.3-20.6z"
        fill="#073042"
      />
      <path
        d="M115 109.3H23.2c-5.7 0-10.2-4.6-10.2-10.3V27.9c0 5.7 4.6 10.3 10.2 10.4h76.9s15-1.3 15 10v61z"
        fill="#4285F4"
      />
      <path
        d="M72.2 72.9C76.3 69.8 77.1 64 74 60c-1.7-2.2-4.3-3.6-7.1-3.7h.3c.5-.1 1.1-.1 1.6 0v-5.7c0-.7-.3-1.3-.9-1.6-.9-.5-2-.2-2.5.7-.2.3-.3.6-.2 1v5.8c-5 .8-8.5 5.5-7.7 10.6v.1c.4 2.4 1.7 4.6 3.7 6l-16.9 36.2h11l7.8-16.6c.9-2 3.3-2.9 5.4-1.9.8.4 1.5 1.1 1.9 1.9l8.1 16.6h11.2L72.2 72.9zm-5.7-1.6c-3.2 0-5.7-2.6-5.7-5.8 0-3.2 2.6-5.7 5.8-5.6 1.5 0 2.8.6 3.9 1.6 2.3 2.2 2.3 5.8.1 8.1-1 1-2.5 1.7-4.1 1.7z"
        fill="#3870B2"
      />
      <path d="M45.2 22.7h39.4v7.2H45.2v-7.2z" fill="#FFF" />
      <path
        d="M63.5 59.8c3.1 0 5.7 2.6 5.6 5.8 0 3.1-2.6 5.7-5.8 5.6-3.1 0-5.6-2.6-5.6-5.7 0-1.5.6-2.9 1.7-4s2.6-1.7 4.1-1.7zm2.2-3.3v-6c0-.7-.3-1.3-.9-1.6-.9-.5-2-.2-2.5.7-.2.3-.3.6-.2 1v5.8c-5 .8-8.5 5.5-7.7 10.6v.1c.4 2.4 1.7 4.6 3.7 6l-21.3 45.7c-.8 1.6-.7 3.6.4 5.1 1.6 2.3 4.7 2.9 7 1.3.8-.5 1.4-1.3 1.8-2.1l14.2-30.4c.9-2 3.3-2.9 5.4-1.9.8.4 1.5 1.1 1.9 1.9L82 122.8c1.2 2.5 4.2 3.5 6.7 2.3 2.5-1.2 3.5-4.2 2.3-6.7L69.1 72.9c4-3.2 4.7-9.1 1.5-13.1-1.2-1.6-2.9-2.7-4.9-3.3"
        fill="#073042"
      />
      <path
        d="M78.8 29.1c-1.5 0-2.7-1.1-2.7-2.6 0-.7.3-1.5.8-2 1.1-1 2.7-1 3.8 0 .5.5.8 1.2.8 1.9-.1 1.5-1.2 2.6-2.7 2.7M49.2 29c-1.5 0-2.7-1.2-2.7-2.6 0-.7.3-1.4.8-1.9.9-1.1 2.6-1.3 3.7-.4h.1c1.1 1 1.2 2.7.2 3.8l-.3.4c-.5.5-1.2.8-1.9.8m30.5-16.2l5.3-9.2c.3-.5.1-1.1-.3-1.5-.5-.2-1-.1-1.3.3L77.8 12C69 8.1 59 8.1 50.3 12l-5.4-9.4c-.2-.3-.6-.6-1-.6s-.8.2-1 .6c-.2.3-.2.8 0 1.1l5.4 9.2C38.9 18 32.8 27.6 31.9 38.2h64.2c-.8-10.7-7-20.2-16.4-25.3"
        fill="#3DDC84"
      />
      <path
        d="M105.6 58.1h-4.2c-.2.1-.4.3-.4.6v66.5c0 .3.2.5.5.5h4.4c5.1 0 9.2-4.2 9.2-9.2V48.8c0 5.1-4.1 9.2-9.2 9.2h-.3z"
        fill="#073042"
      />
    </svg>
  );
}

function GhosttyOpenIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      aria-hidden
      fill="none"
      viewBox="0 0 27 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20.395 32a6.35 6.35 0 0 1-3.516-1.067A6.355 6.355 0 0 1 13.362 32c-1.249 0-2.48-.375-3.516-1.067A6.265 6.265 0 0 1 6.372 32h-.038a6.255 6.255 0 0 1-4.5-1.906 6.377 6.377 0 0 1-1.836-4.482v-12.25C0 5.995 5.994 0 13.362 0c7.369 0 13.363 5.994 13.363 13.363v12.253c0 3.393-2.626 6.192-5.978 6.375-.117.007-.234.009-.352.009Z"
        fill="#3551F3"
      />
      <path
        d="M20.395 30.593a4.932 4.932 0 0 1-3.08-1.083.656.656 0 0 0-.42-.145.784.784 0 0 0-.487.176 4.939 4.939 0 0 1-3.046 1.055 4.939 4.939 0 0 1-3.045-1.055.751.751 0 0 0-.942 0 4.883 4.883 0 0 1-3.01 1.055h-.033a4.852 4.852 0 0 1-3.49-1.482 4.982 4.982 0 0 1-1.436-3.498V13.367c0-6.597 5.364-11.96 11.957-11.96 6.592 0 11.956 5.363 11.956 11.956v12.253c0 2.645-2.042 4.827-4.65 4.97a5.342 5.342 0 0 1-.274.007Z"
        fill="#000"
      />
      <path
        d="M23.912 13.363v12.253c0 1.876-1.447 3.463-3.32 3.566a3.503 3.503 0 0 1-2.398-.769c-.778-.626-1.873-.598-2.658.021a3.5 3.5 0 0 1-2.176.753 3.494 3.494 0 0 1-2.173-.753 2.153 2.153 0 0 0-2.684 0 3.498 3.498 0 0 1-2.15.753c-1.948.014-3.54-1.627-3.54-3.575v-12.25c0-5.825 4.724-10.549 10.55-10.549 5.825 0 10.549 4.724 10.549 10.55Z"
        fill="#fff"
      />
      <path
        d="m11.28 12.437-3.93-2.27a1.072 1.072 0 0 0-1.463.392 1.072 1.072 0 0 0 .391 1.463l2.326 1.343-2.326 1.343a1.072 1.072 0 0 0 1.071 1.855l3.932-2.27a1.071 1.071 0 0 0 0-1.854v-.002ZM20.182 12.291h-5.164a1.071 1.071 0 1 0 0 2.143h5.164a1.071 1.071 0 1 0 0-2.143Z"
        fill="#000"
      />
    </svg>
  );
}

function XcodeOpenIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  const uid = useId().replace(/:/g, "");
  const innerHtml = useMemo(() => {
    const prefixed = XCODE_OPEN_SVG.replace(/xcode-original-/g, `${uid}-xc-`);
    return prefixed.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/i, "");
  }, [uid]);

  return (
    <svg
      {...props}
      aria-hidden
      className={className}
      dangerouslySetInnerHTML={{ __html: innerHtml }}
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
    />
  );
}

export function OpenTargetGlyph({
  className,
  target,
}: {
  className?: string;
  target: Pick<DesktopOpenTarget, "id" | "kind">;
}) {
  const base = cn("size-3.5 shrink-0", className);
  const mono = cn(base, "text-foreground");

  switch (target.id) {
    case "android-studio":
      return <AndroidStudioOpenIcon className={base} />;
    case "cursor":
      return <CursorOpenIcon className={mono} />;
    case "finder":
      return <FinderOpenIcon className={mono} />;
    case "ghostty":
      return <GhosttyOpenIcon className={base} />;
    case "xcode":
      return <XcodeOpenIcon className={base} />;
    case "zed":
      return <ZedOpenIcon className={mono} />;
    default:
      return null;
  }
}
