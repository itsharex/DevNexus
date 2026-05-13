import { describe, expect, it } from "vitest";

import { defaultRequest, parseHistoryRequest, prettyBody } from "@/plugins/api-debugger/utils/api-debugger";

describe("api debugger utilities", () => {
  it("creates a default request with safe defaults", () => {
    const request = defaultRequest();
    expect(request.method).toBe("GET");
    expect(request.followRedirects).toBe(true);
    expect(request.validateSsl).toBe(true);
  });

  it("pretty prints json response bodies", () => {
    expect(prettyBody('{"ok":true}', "application/json")).toContain('\n  "ok": true\n');
  });

  it("loads a request snapshot from history", () => {
    const request = parseHistoryRequest(JSON.stringify({ method: "POST", url: "https://example.com" }));
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://example.com");
    expect(request.requestId).toBeTruthy();
  });
});
