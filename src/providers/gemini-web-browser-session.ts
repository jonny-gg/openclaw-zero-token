import {
  type ResolvedBrowserConfig,
  type ResolvedBrowserProfile,
  resolveBrowserConfig,
  resolveProfile,
} from "../browser/config.js";
import { loadConfig } from "../config/io.js";

export type GeminiBrowserSessionOptions = {
  profileName?: string;
  headless?: boolean;
  attachOnly?: boolean;
};

export type ResolvedGeminiBrowserSession = {
  browserConfig: ResolvedBrowserConfig;
  profile: ResolvedBrowserProfile;
  profileName: string;
  headless: boolean;
  attachOnly: boolean;
};

const GOOGLE_AUTH_COOKIE_NAMES = new Set([
  "SID",
  "HSID",
  "SSID",
  "APISID",
  "SAPISID",
  "__Secure-1PSID",
  "__Secure-3PSID",
]);

type CookieLike = {
  name: string;
  value: string;
};

export function resolveGeminiBrowserSession(
  options: GeminiBrowserSessionOptions = {},
): ResolvedGeminiBrowserSession {
  const rootConfig = loadConfig();
  const browserConfig = resolveBrowserConfig(rootConfig.browser, rootConfig);
  const profileName = options.profileName?.trim() || browserConfig.defaultProfile;
  const profile = resolveProfile(browserConfig, profileName);
  if (!profile) {
    throw new Error(`Could not resolve browser profile '${profileName}'`);
  }

  return {
    browserConfig,
    profile,
    profileName,
    headless: options.headless ?? browserConfig.headless,
    attachOnly: options.attachOnly ?? profile.attachOnly,
  };
}

export function hasGoogleSessionCookies(cookies: CookieLike[]): boolean {
  return cookies.some((cookie) => GOOGLE_AUTH_COOKIE_NAMES.has(cookie.name));
}

export function stringifyCookies(cookies: CookieLike[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
