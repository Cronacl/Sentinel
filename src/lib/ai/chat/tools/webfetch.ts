import TurndownService from "turndown";
import { z } from "zod";

import { getErrorMessage } from "@/lib/errors";
import {
  MAX_WEBFETCH_BATCH_LIMIT,
  type WebFetchSettings,
} from "@/lib/webfetch";

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_TIMEOUT_SECONDS = 120;
const MAX_CONTENT_CHARS = 120_000;
const MAX_REDIRECTS = 5;
const CONTENT_TRUNCATION_NOTICE =
  "\n\n[Content truncated to keep the tool response within chat limits.]";

const turndown = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  headingStyle: "atx",
  hr: "---",
});

turndown.remove(["link", "meta", "noscript", "script", "style"]);

export const webFetchInputSchema = z
  .object({
    format: z
      .enum(["text", "markdown", "html"])
      .default("markdown")
      .describe(
        "The response format to return. Prefer markdown for documentation pages unless plain text or raw HTML is specifically needed.",
      ),
    timeout: z
      .number()
      .int()
      .min(1)
      .max(MAX_TIMEOUT_SECONDS)
      .optional()
      .describe("Optional timeout in seconds, up to 120."),
    url: z.string().min(1).optional().describe("A single URL to fetch."),
    urls: z
      .array(z.string().min(1))
      .min(1)
      .max(MAX_WEBFETCH_BATCH_LIMIT)
      .optional()
      .describe(
        "Optional batch of URLs to fetch when batch mode is enabled in General settings.",
      ),
  })
  .superRefine((value, ctx) => {
    if (!value.url && !value.urls?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either url or urls.",
        path: ["url"],
      });
    }

    if (value.url && value.urls?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either url or urls, not both.",
        path: ["urls"],
      });
    }
  });

const webFetchSuccessResultSchema = z.object({
  content: z.string().nullable(),
  contentType: z.string(),
  format: z.enum(["text", "markdown", "html"]),
  imageDataUrl: z.string().nullable(),
  isImage: z.boolean(),
  sizeBytes: z.number().int().min(0),
  status: z.literal("success"),
  statusCode: z.number().int().min(100).max(599),
  title: z.string().nullable(),
  truncated: z.boolean(),
  url: z.string(),
});

const webFetchErrorResultSchema = z.object({
  error: z.string(),
  status: z.literal("error"),
  url: z.string(),
});

export const webFetchResultSchema = z.discriminatedUnion("status", [
  webFetchSuccessResultSchema,
  webFetchErrorResultSchema,
]);

export const webFetchOutputSchema = z.object({
  failureCount: z.number().int().min(0),
  isBatch: z.boolean(),
  requestedCount: z.number().int().min(1),
  results: z.array(webFetchResultSchema).min(1),
  successCount: z.number().int().min(0),
});

export type WebFetchInput = z.infer<typeof webFetchInputSchema>;
export type WebFetchResult = z.infer<typeof webFetchResultSchema>;
export type WebFetchSuccessResult = z.infer<typeof webFetchSuccessResultSchema>;
export type WebFetchOutput = z.infer<typeof webFetchOutputSchema>;

function normalizeUrl(inputUrl: string) {
  const trimmed = inputUrl.trim();
  if (!trimmed) {
    throw new Error("URL is required.");
  }

  const upgradedUrl = trimmed.startsWith("http://")
    ? `https://${trimmed.slice("http://".length)}`
    : trimmed;

  let parsed: URL;
  try {
    parsed = new URL(upgradedUrl);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL must start with http:// or https://.");
  }

  if (parsed.protocol === "http:") {
    parsed.protocol = "https:";
  }

  return parsed.toString();
}

function normalizeHostname(hostname: string) {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1).toLowerCase()
    : hostname.toLowerCase();
}

function isBlockedIpv4Address(hostname: string) {
  const octets = hostname.split(".").map((part) => Number.parseInt(part, 10));

  if (
    octets.length !== 4 ||
    octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const first = octets[0] ?? -1;
  const second = octets[1] ?? -1;
  const third = octets[2] ?? -1;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function isBlockedIpv6Address(hostname: string) {
  const normalized = hostname.toLowerCase();

  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fe80:") ||
    /^f[c-d][0-9a-f]{2}:/i.test(normalized)
  ) {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    return isBlockedIpv4Address(normalized.slice("::ffff:".length));
  }

  return false;
}

function assertWebFetchTargetAllowed(targetUrl: string) {
  const parsed = new URL(targetUrl);
  const hostname = normalizeHostname(parsed.hostname);

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error(
      "Blocked URL: localhost and local network targets are not allowed.",
    );
  }

  if (isBlockedIpv4Address(hostname) || isBlockedIpv6Address(hostname)) {
    throw new Error(
      "Blocked URL: private, loopback, and reserved IP ranges are not allowed.",
    );
  }
}

function isRedirectStatus(status: number) {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

async function fetchWithSafeRedirects({
  headers,
  signal,
  url,
}: {
  headers: HeadersInit;
  signal: AbortSignal;
  url: string;
}) {
  let currentUrl = url;

  for (
    let redirectCount = 0;
    redirectCount <= MAX_REDIRECTS;
    redirectCount += 1
  ) {
    assertWebFetchTargetAllowed(currentUrl);

    const response = await fetch(currentUrl, {
      headers,
      redirect: "manual",
      signal,
    });

    if (!isRedirectStatus(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    if (redirectCount === MAX_REDIRECTS) {
      throw new Error(`Too many redirects (maximum ${MAX_REDIRECTS}).`);
    }

    currentUrl = normalizeUrl(new URL(location, currentUrl).toString());
  }

  throw new Error(`Too many redirects (maximum ${MAX_REDIRECTS}).`);
}

function buildAcceptHeader(format: WebFetchInput["format"]) {
  switch (format) {
    case "markdown":
      return "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1";
    case "text":
      return "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1";
    case "html":
      return "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1";
    default:
      return "*/*";
  }
}

function getMimeType(contentType: string) {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isHtmlMimeType(mimeType: string) {
  return mimeType === "text/html" || mimeType === "application/xhtml+xml";
}

function isMarkdownMimeType(mimeType: string) {
  return mimeType === "text/markdown" || mimeType === "text/x-markdown";
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTitle(html: string) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const rawTitle = match?.[1]?.replace(/\s+/g, " ").trim();

  if (!rawTitle) {
    return null;
  }

  return decodeHtmlEntities(rawTitle);
}

function convertHtmlToMarkdown(html: string) {
  return turndown.turndown(html).trim();
}

function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/^```[^\n]*\n?/, "").replace(/```$/, ""),
    )
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function convertHtmlToText(html: string) {
  return markdownToPlainText(convertHtmlToMarkdown(html));
}

function truncateContent(content: string) {
  if (content.length <= MAX_CONTENT_CHARS) {
    return { content, truncated: false };
  }

  return {
    content: `${content.slice(0, MAX_CONTENT_CHARS)}${CONTENT_TRUNCATION_NOTICE}`,
    truncated: true,
  };
}

function buildFallbackTitle(targetUrl: string) {
  try {
    const parsed = new URL(targetUrl);
    const pathname = parsed.pathname.replace(/\/$/, "");
    const lastSegment = pathname.split("/").filter(Boolean).at(-1);
    return lastSegment || parsed.hostname;
  } catch {
    return targetUrl;
  }
}

async function fetchWithCloudflareRetry({
  format,
  signal,
  url,
}: {
  format: WebFetchInput["format"];
  signal: AbortSignal;
  url: string;
}) {
  const headers = {
    Accept: buildAcceptHeader(format),
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
  };

  const initial = await fetchWithSafeRedirects({
    headers,
    signal,
    url,
  });

  if (
    initial.status === 403 &&
    initial.headers.get("cf-mitigated") === "challenge"
  ) {
    return await fetchWithSafeRedirects({
      headers: {
        ...headers,
        "User-Agent": "sentinel-webfetch",
      },
      signal,
      url,
    });
  }

  return initial;
}

async function fetchSingleUrl({
  abortSignal,
  format,
  timeout,
  url,
}: {
  abortSignal?: AbortSignal;
  format: WebFetchInput["format"];
  timeout?: number;
  url: string;
}): Promise<WebFetchSuccessResult> {
  const normalizedUrl = normalizeUrl(url);
  assertWebFetchTargetAllowed(normalizedUrl);
  const timeoutMs = Math.min(
    (timeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000,
    MAX_TIMEOUT_SECONDS * 1000,
  );
  const controller = new AbortController();
  let timedOut = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const abortFromCaller = () => {
    controller.abort();
  };

  abortSignal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const response = await fetchWithCloudflareRetry({
      format,
      signal: controller.signal,
      url: normalizedUrl,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status code: ${response.status}`);
    }

    const declaredLength = Number.parseInt(
      response.headers.get("content-length") ?? "",
      10,
    );
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_SIZE) {
      throw new Error("Response too large (exceeds 5MB limit).");
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_RESPONSE_SIZE) {
      throw new Error("Response too large (exceeds 5MB limit).");
    }

    const contentType =
      response.headers.get("content-type") ?? "application/octet-stream";
    const mimeType = getMimeType(contentType);
    const finalUrl = response.url || normalizedUrl;
    const sizeBytes = arrayBuffer.byteLength;

    if (mimeType.startsWith("image/")) {
      return {
        content: null,
        contentType: mimeType || contentType,
        format,
        imageDataUrl: `data:${mimeType};base64,${Buffer.from(arrayBuffer).toString("base64")}`,
        isImage: true,
        sizeBytes,
        status: "success",
        statusCode: response.status,
        title: buildFallbackTitle(finalUrl),
        truncated: false,
        url: finalUrl,
      };
    }

    const rawContent = new TextDecoder().decode(arrayBuffer);
    const title =
      (isHtmlMimeType(mimeType) ? extractTitle(rawContent) : null) ??
      buildFallbackTitle(finalUrl);

    let formattedContent = rawContent;

    if (format === "markdown" && isHtmlMimeType(mimeType)) {
      formattedContent = convertHtmlToMarkdown(rawContent);
    } else if (format === "text") {
      if (isHtmlMimeType(mimeType)) {
        formattedContent = convertHtmlToText(rawContent);
      } else if (isMarkdownMimeType(mimeType)) {
        formattedContent = markdownToPlainText(rawContent);
      }
    }

    const { content, truncated } = truncateContent(formattedContent);

    return {
      content,
      contentType: mimeType || contentType,
      format,
      imageDataUrl: null,
      isImage: false,
      sizeBytes,
      status: "success",
      statusCode: response.status,
      title,
      truncated,
      url: finalUrl,
    };
  } catch (error) {
    if (timedOut) {
      throw new Error(
        `Request timed out after ${Math.floor(timeoutMs / 1000)} seconds.`,
      );
    }

    if (abortSignal?.aborted) {
      throw new Error("Request aborted.");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    abortSignal?.removeEventListener("abort", abortFromCaller);
  }
}

function buildOutput(results: WebFetchResult[], requestedCount: number) {
  const successCount = results.filter(
    (result) => result.status === "success",
  ).length;
  const failureCount = requestedCount - successCount;

  return {
    failureCount,
    isBatch: requestedCount > 1,
    requestedCount,
    results,
    successCount,
  } satisfies WebFetchOutput;
}

export async function executeWebFetch({
  abortSignal,
  input,
  settings,
}: {
  abortSignal?: AbortSignal;
  input: WebFetchInput;
  settings: WebFetchSettings;
}): Promise<WebFetchOutput> {
  if (input.urls?.length) {
    if (input.urls.length > 1 && !settings.batchEnabled) {
      throw new Error(
        "Batch web fetch is disabled in Search settings. Enable it to fetch multiple URLs at once.",
      );
    }

    if (input.urls.length > settings.batchLimit) {
      throw new Error(
        `Batch web fetch limit exceeded. Your current limit is ${settings.batchLimit} URLs per call.`,
      );
    }

    const results: WebFetchResult[] = [];

    for (const url of input.urls) {
      if (abortSignal?.aborted) {
        throw new Error("Request aborted.");
      }

      try {
        results.push(
          await fetchSingleUrl({
            abortSignal,
            format: input.format,
            timeout: input.timeout,
            url,
          }),
        );
      } catch (error) {
        if (abortSignal?.aborted) {
          throw error;
        }

        const normalizedUrl = (() => {
          try {
            return normalizeUrl(url);
          } catch {
            return url.trim();
          }
        })();

        results.push({
          error: getErrorMessage(error),
          status: "error",
          url: normalizedUrl,
        });
      }
    }

    return buildOutput(results, input.urls.length);
  }

  const result = await fetchSingleUrl({
    abortSignal,
    format: input.format,
    timeout: input.timeout,
    url: input.url!,
  });

  return buildOutput([result], 1);
}

export const __internal = {
  CONTENT_TRUNCATION_NOTICE,
  DEFAULT_TIMEOUT_SECONDS,
  MAX_CONTENT_CHARS,
  MAX_REDIRECTS,
  MAX_RESPONSE_SIZE,
  MAX_TIMEOUT_SECONDS,
  assertWebFetchTargetAllowed,
  buildAcceptHeader,
  convertHtmlToMarkdown,
  convertHtmlToText,
  markdownToPlainText,
  normalizeUrl,
  truncateContent,
};
