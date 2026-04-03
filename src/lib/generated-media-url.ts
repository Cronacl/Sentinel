export function buildGeneratedMediaUrl(artifactPath: string) {
  return `/api/generated-media/${artifactPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}
