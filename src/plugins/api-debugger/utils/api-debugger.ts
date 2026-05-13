import type { ApiKeyValue, ApiSendRequest } from "@/plugins/api-debugger/types";

export const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function emptyKeyValue(): ApiKeyValue {
  return { key: "", value: "", enabled: true };
}

export function normalizePairs(items?: ApiKeyValue[]): ApiKeyValue[] {
  const rows = items?.length ? items : [emptyKeyValue()];
  return rows.map((item) => ({ ...item, enabled: item.enabled ?? true }));
}

export function defaultRequest(): ApiSendRequest {
  return {
    requestId: crypto.randomUUID(),
    method: "GET",
    url: "https://httpbin.org/get",
    params: [emptyKeyValue()],
    headers: [emptyKeyValue()],
    cookies: [emptyKeyValue()],
    auth: { authType: "none" },
    body: { bodyType: "none" },
    timeoutMs: 30000,
    followRedirects: true,
    validateSsl: true,
    saveHistory: true,
  };
}

export function prettyBody(body: string, contentType?: string): string {
  const looksJson = contentType?.includes("json") || /^[\s\r\n]*[\[{]/.test(body);
  if (!looksJson) return body;
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

export function parseSavedRequest(saved: { method: string; url: string; paramsJson: string; headersJson: string; cookiesJson: string; authJson: string; bodyJson: string; timeoutMs: number; followRedirects: boolean; validateSsl: boolean }): ApiSendRequest {
  return {
    requestId: crypto.randomUUID(),
    method: saved.method,
    url: saved.url,
    params: normalizePairs(JSON.parse(saved.paramsJson || "[]") as ApiKeyValue[]),
    headers: normalizePairs(JSON.parse(saved.headersJson || "[]") as ApiKeyValue[]),
    cookies: normalizePairs(JSON.parse(saved.cookiesJson || "[]") as ApiKeyValue[]),
    auth: JSON.parse(saved.authJson || "null"),
    body: JSON.parse(saved.bodyJson || "null"),
    timeoutMs: saved.timeoutMs,
    followRedirects: saved.followRedirects,
    validateSsl: saved.validateSsl,
    saveHistory: true,
  };
}

export function parseHistoryRequest(json: string): ApiSendRequest {
  const parsed = JSON.parse(json) as ApiSendRequest;
  return { ...defaultRequest(), ...parsed, requestId: crypto.randomUUID() };
}
