import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadConfigMock } = vi.hoisted(() => ({
  loadConfigMock: vi.fn(),
}));

vi.mock("../config/io.js", () => ({
  loadConfig: loadConfigMock,
}));

import {
  hasGoogleSessionCookies,
  resolveGeminiBrowserSession,
  stringifyCookies,
} from "./gemini-web-browser-session.js";

describe("gemini web browser session", () => {
  beforeEach(() => {
    loadConfigMock.mockReset();
  });

  it("resolves explicit profile and per-session browser overrides", () => {
    loadConfigMock.mockReturnValue({
      browser: {
        headless: false,
        attachOnly: false,
        defaultProfile: "openclaw",
        profiles: {
          openclaw: { cdpPort: 18800, color: "#FF4500" },
          googleheadless: {
            cdpUrl: "http://127.0.0.1:9222",
            attachOnly: true,
            color: "#0066CC",
          },
        },
      },
    });

    const resolved = resolveGeminiBrowserSession({
      profileName: "googleheadless",
      headless: true,
      attachOnly: true,
    });

    expect(resolved.profileName).toBe("googleheadless");
    expect(resolved.profile.cdpUrl).toBe("http://127.0.0.1:9222");
    expect(resolved.attachOnly).toBe(true);
    expect(resolved.headless).toBe(true);
  });

  it("falls back to browser defaults when no override is supplied", () => {
    loadConfigMock.mockReturnValue({
      browser: {
        headless: true,
        attachOnly: true,
        defaultProfile: "google",
        profiles: {
          google: {
            cdpUrl: "http://127.0.0.1:9222",
            color: "#0066CC",
          },
        },
      },
    });

    const resolved = resolveGeminiBrowserSession();

    expect(resolved.profileName).toBe("google");
    expect(resolved.attachOnly).toBe(true);
    expect(resolved.headless).toBe(true);
  });

  it("detects google auth cookies and stringifies them for reuse", () => {
    const cookies = [
      { name: "NID", value: "other-cookie" },
      { name: "__Secure-1PSID", value: "google-session" },
    ];

    expect(hasGoogleSessionCookies(cookies)).toBe(true);
    expect(stringifyCookies(cookies)).toBe("NID=other-cookie; __Secure-1PSID=google-session");
  });

  it("ignores unrelated cookies", () => {
    expect(hasGoogleSessionCookies([{ name: "NID", value: "x" }])).toBe(false);
  });
});
