export function buildUploadedMediaUrl(artifactPath: string) {
  return `/api/uploaded-media/${artifactPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}
