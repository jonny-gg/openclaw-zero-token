import { chromium } from "playwright-core";
import { getHeadersWithAuth } from "../browser/cdp.helpers.js";
import {
  getChromeWebSocketUrl,
  launchOpenClawChrome,
  stopOpenClawChrome,
} from "../browser/chrome.js";
import {
  hasGoogleSessionCookies,
  resolveGeminiBrowserSession,
  stringifyCookies,
  type GeminiBrowserSessionOptions,
} from "./gemini-web-browser-session.js";

export interface GeminiWebAuthResult {
  cookie: string;
  userAgent: string;
  profileName?: string;
  headless?: boolean;
  attachOnly?: boolean;
}

export interface GeminiWebAuthOptions extends GeminiBrowserSessionOptions {
  onProgress?: (message: string) => void;
  openUrl?: (url: string) => Promise<boolean>;
}

const GEMINI_AUTH_TIMEOUT_MS = 300_000;
const GEMINI_POLL_INTERVAL_MS = 2_000;

export async function loginGeminiWeb(
  options: GeminiWebAuthOptions = {},
): Promise<GeminiWebAuthResult> {
  const { onProgress = console.log } = options;
  const session = resolveGeminiBrowserSession(options);
  const { browserConfig, profile, profileName, headless, attachOnly } = session;

  let running: Awaited<ReturnType<typeof launchOpenClawChrome>> | { cdpPort: number };
  let didLaunch = false;

  if (attachOnly) {
    onProgress(`Connecting to existing browser session (${profileName})...`);
    const wsUrl = await getChromeWebSocketUrl(profile.cdpUrl, 5000);
    if (!wsUrl) {
      throw new Error(
        `Failed to connect to Chrome at ${profile.cdpUrl}. ` +
          `Make sure the "${profileName}" browser profile is already running with CDP enabled.`,
      );
    }
    running = { cdpPort: profile.cdpPort };
  } else {
    onProgress(
      `Launching browser profile "${profileName}"${headless ? " in headless mode" : ""}...`,
    );
    running = await launchOpenClawChrome(browserConfig, profile, { headless });
    didLaunch = true;
  }

  try {
    const cdpUrl = attachOnly ? profile.cdpUrl : `http://127.0.0.1:${running.cdpPort}`;
    let wsUrl: string | null = null;

    onProgress("Waiting for browser debugger...");
    for (let i = 0; i < 10; i++) {
      wsUrl = await getChromeWebSocketUrl(cdpUrl, 2000);
      if (wsUrl) {
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!wsUrl) {
      throw new Error(`Failed to resolve Chrome WebSocket URL from ${cdpUrl} after retries.`);
    }

    onProgress("Connecting to browser...");
    const browser = await chromium.connectOverCDP(wsUrl, {
      headers: getHeadersWithAuth(wsUrl),
    });
    const context = browser.contexts()[0];
    const page = context.pages()[0] || (await context.newPage());

    onProgress("Navigating to Gemini...");
    await page.goto("https://gemini.google.com/app", { waitUntil: "domcontentloaded" });

    const getAuthCookies = async () => {
      const cookies = await context.cookies([
        "https://gemini.google.com",
        "https://accounts.google.com",
        "https://www.google.com",
      ]);
      if (!hasGoogleSessionCookies(cookies)) {
        return null;
      }
      return stringifyCookies(cookies);
    };

    const existingCookieString = await getAuthCookies();
    const userAgent = await page.evaluate(() => navigator.userAgent);
    if (existingCookieString) {
      onProgress("Existing Google session detected, capturing cookies...");
      return {
        cookie: existingCookieString,
        userAgent,
        profileName,
        headless,
        attachOnly,
      };
    }

    if (attachOnly && headless) {
      throw new Error(
        `Attached headless profile "${profileName}" does not have an active Google session. ` +
          "Log into Gemini in that browser profile first, then retry.",
      );
    }

    onProgress("Please login in the browser window...");
    onProgress("Waiting for authentication...");

    const startedAt = Date.now();
    while (Date.now() - startedAt < GEMINI_AUTH_TIMEOUT_MS) {
      const cookieString = await getAuthCookies();
      if (cookieString) {
        onProgress("Login detected, capturing cookies...");
        onProgress("Authentication captured successfully!");
        return {
          cookie: cookieString,
          userAgent,
          profileName,
          headless,
          attachOnly,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, GEMINI_POLL_INTERVAL_MS));
    }

    throw new Error("Timed out waiting for Gemini authentication.");
  } finally {
    if (didLaunch && running && "proc" in running) {
      await stopOpenClawChrome(running);
    }
  }
}
