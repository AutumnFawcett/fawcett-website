export const FOUNDER_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function assertFounderRequestId(requestId) {
  if (typeof requestId !== "string" || !FOUNDER_REQUEST_ID_PATTERN.test(requestId)) {
    throw new Error("invalid_request_id");
  }
  return requestId;
}

export function isSafeSquareCheckoutUrl(value) {
  if (typeof value !== "string" || !value || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    const authority = value.match(/^https:\/\/([^/?#]+)/)?.[1];
    return url.protocol === "https:"
      && !url.username && !url.password && !url.port
      && typeof authority === "string" && !authority.includes(":") && !authority.includes("@")
      && (url.hostname === "square.link" || url.hostname === "checkout.square.site");
  } catch {
    return false;
  }
}
