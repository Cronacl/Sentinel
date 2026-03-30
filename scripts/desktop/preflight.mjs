import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import path from "node:path";

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function appendSummary(lines) {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return;
  }

  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });

  if (result.status === 0) {
    return (result.stdout ?? "").trim();
  }

  const message = [
    result.stdout?.trim(),
    result.stderr?.trim(),
    `${command} exited with code ${result.status ?? 1}`,
  ]
    .filter(Boolean)
    .join("\n");

  throw new Error(message);
}

function hasMacSigningCredentials() {
  return Boolean(process.env.CSC_LINK?.trim() || process.env.CSC_NAME?.trim());
}

function hasMacNotarizationCredentials() {
  return Boolean(
    process.env.APPLE_ID?.trim() &&
    process.env.APPLE_APP_SPECIFIC_PASSWORD?.trim() &&
    process.env.APPLE_TEAM_ID?.trim(),
  );
}

const platform = getArgValue("--platform");
if (!platform || !["mac", "linux", "win"].includes(platform)) {
  throw new Error('Expected "--platform" to be one of: mac, linux, win.');
}

const summaryLines = [
  "### Desktop preflight",
  "",
  `- Platform: \`${platform}\``,
];

if (platform !== "mac") {
  summaryLines.push(
    "- Preflight: no platform-specific signing checks required",
  );
  appendSummary(summaryLines);
  console.log(`[desktop] preflight passed for ${platform}`);
  process.exit(0);
}

const entitlementsPaths = [
  path.resolve("build/entitlements.mac.plist"),
  path.resolve("build/entitlements.mac.inherit.plist"),
];

for (const entitlementsPath of entitlementsPaths) {
  runChecked("plutil", ["-lint", entitlementsPath]);
}

summaryLines.push("- Entitlements: valid plist files");

if (!hasMacSigningCredentials()) {
  summaryLines.push("- Signing: unsigned build");
  summaryLines.push("- Notarization: disabled");
  appendSummary(summaryLines);
  console.log("[desktop] mac preflight passed for unsigned build");
  process.exit(0);
}

const cscLink = process.env.CSC_LINK?.trim() ?? "";
const cscName = process.env.CSC_NAME?.trim() ?? "";

if (cscLink) {
  const isRemoteCscLink =
    cscLink.startsWith("https://") ||
    cscLink.startsWith("http://") ||
    cscLink.startsWith("file://");

  if (isRemoteCscLink) {
    summaryLines.push("- Signing: CSC_LINK provided as remote URL");
  } else {
    const certificatePath = path.resolve(cscLink);
    if (!existsSync(certificatePath)) {
      throw new Error(`CSC_LINK file was not found at ${certificatePath}.`);
    }

    const cscKeyPassword = process.env.CSC_KEY_PASSWORD?.trim();
    if (!cscKeyPassword) {
      throw new Error(
        "CSC_KEY_PASSWORD is required when CSC_LINK points to a local certificate file.",
      );
    }

    runChecked("openssl", [
      "pkcs12",
      "-in",
      certificatePath,
      "-nokeys",
      "-passin",
      `pass:${cscKeyPassword}`,
    ]);

    const certPem = runChecked("openssl", [
      "pkcs12",
      "-in",
      certificatePath,
      "-clcerts",
      "-nokeys",
      "-passin",
      `pass:${cscKeyPassword}`,
    ]);
    const certSubject = runChecked("openssl", ["x509", "-noout", "-subject"], {
      input: certPem,
    });

    if (!certSubject.includes("Developer ID Application:")) {
      throw new Error(
        `Expected a Developer ID Application certificate, got: ${certSubject}`,
      );
    }

    summaryLines.push(`- Signing: ${certSubject.replace(/^subject=\s*/, "")}`);
  }
} else {
  summaryLines.push(`- Signing: ${cscName}`);
}

summaryLines.push(
  `- Notarization: ${hasMacNotarizationCredentials() ? "enabled" : "disabled"}`,
);

appendSummary(summaryLines);
console.log("[desktop] mac preflight passed");
