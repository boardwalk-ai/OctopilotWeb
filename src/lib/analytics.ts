"use client";

/**
 * Marketing conversion pixels — Meta, Google, TikTok, Reddit.
 *
 * IDs are supplied via public env vars so the marketing team can plug them in
 * later without a code change (set the var, redeploy). A platform with no ID is
 * simply skipped, and every call is a safe no-op until its pixel is initialised.
 *
 *   NEXT_PUBLIC_META_PIXEL_ID     Meta (Facebook) Pixel ID
 *   NEXT_PUBLIC_GOOGLE_ID         Google gtag ID (GA4 "G-…" or Google Ads "AW-…")
 *   NEXT_PUBLIC_TIKTOK_PIXEL_ID   TikTok Pixel ID
 *   NEXT_PUBLIC_REDDIT_PIXEL_ID   Reddit Pixel ID
 *
 * PageView fires on load + every route change (see AnalyticsPixels). Conversion
 * events: sign up, Start Writing, Get Started.
 */

const META = (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "").trim();
const GOOGLE = (process.env.NEXT_PUBLIC_GOOGLE_ID ?? "").trim();
const TIKTOK = (process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID ?? "").trim();
const REDDIT = (process.env.NEXT_PUBLIC_REDDIT_PIXEL_ID ?? "").trim();

type PixelWindow = Window & {
  fbq?: (...args: unknown[]) => void;
  gtag?: (...args: unknown[]) => void;
  ttq?: { page?: () => void; track?: (event: string, params?: unknown) => void };
  rdt?: (...args: unknown[]) => void;
  __octoPixelsInit?: boolean;
};

function win(): PixelWindow | null {
  return typeof window === "undefined" ? null : (window as PixelWindow);
}

function injectInline(code: string): void {
  const el = document.createElement("script");
  el.type = "text/javascript";
  el.text = code;
  document.head.appendChild(el);
}

function loadScript(src: string): void {
  const el = document.createElement("script");
  el.async = true;
  el.src = src;
  document.head.appendChild(el);
}

let initialized = false;

/** Inject each configured pixel's loader (idempotent). */
export function initPixels(): void {
  const w = win();
  if (!w || initialized || w.__octoPixelsInit) return;
  initialized = true;
  w.__octoPixelsInit = true;

  try {
    if (META) {
      injectInline(
        `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META}');fbq('track','PageView');`,
      );
    }

    if (GOOGLE) {
      loadScript(`https://www.googletagmanager.com/gtag/js?id=${GOOGLE}`);
      injectInline(
        `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GOOGLE}');`,
      );
    }

    if (TIKTOK) {
      injectInline(
        `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var i=d.createElement("script");i.type="text/javascript",i.async=!0,i.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(i,a)};ttq.load('${TIKTOK}');ttq.page()}(window,document,'ttq');`,
      );
    }

    if (REDDIT) {
      injectInline(
        `!function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement("script");t.src="https://www.redditstatic.com/ads/pixel.js",t.async=!0;var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(t,s)}}(window,document);rdt('init','${REDDIT}');rdt('track','PageVisit');`,
      );
    }
  } catch {
    // Pixels are best-effort; never let a loader break the app.
  }
}

/** Fire a PageView on every configured pixel (called on route change). */
export function trackPageView(): void {
  const w = win();
  if (!w) return;
  try {
    if (META) w.fbq?.("track", "PageView");
    if (GOOGLE) w.gtag?.("event", "page_view");
    if (TIKTOK) w.ttq?.page?.();
    if (REDDIT) w.rdt?.("track", "PageVisit");
  } catch {
    /* no-op */
  }
}

/** Sign-up / registration conversion (deduped once per browser). */
export function trackSignUp(): void {
  const w = win();
  if (!w) return;
  try {
    if (localStorage.getItem("octopilot.pixel.signup") === "1") return;
    localStorage.setItem("octopilot.pixel.signup", "1");
  } catch {
    /* ignore storage errors */
  }
  try {
    if (META) w.fbq?.("track", "CompleteRegistration");
    if (GOOGLE) w.gtag?.("event", "sign_up");
    if (TIKTOK) w.ttq?.track?.("CompleteRegistration");
    if (REDDIT) w.rdt?.("track", "SignUp");
  } catch {
    /* no-op */
  }
}

/** "Start Writing" — user begins the writing flow from home. */
export function trackStartWriting(): void {
  const w = win();
  if (!w) return;
  try {
    if (META) w.fbq?.("track", "Lead", { content_name: "Start Writing" });
    if (GOOGLE) w.gtag?.("event", "start_writing");
    if (TIKTOK) w.ttq?.track?.("ClickButton", { content_name: "Start Writing" });
    if (REDDIT) w.rdt?.("track", "Custom", { customEventName: "StartWriting" });
  } catch {
    /* no-op */
  }
}

/** "Get Started" — user commits to a mode on the methodology screen. */
export function trackGetStarted(mode?: string): void {
  const w = win();
  if (!w) return;
  try {
    if (META) w.fbq?.("track", "InitiateCheckout", { content_name: "Get Started", content_category: mode });
    if (GOOGLE) w.gtag?.("event", "get_started", { mode });
    if (TIKTOK) w.ttq?.track?.("ClickButton", { content_name: "Get Started", content_category: mode });
    if (REDDIT) w.rdt?.("track", "Custom", { customEventName: "GetStarted" });
  } catch {
    /* no-op */
  }
}
