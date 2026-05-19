// The consumer-facing site origin (rowo.link in prod, localhost:5173 in dev).
// We never read this from the API — it is purely a client-side hint.
export const MAIN_SITE_ORIGIN =
  typeof window !== 'undefined' && window.location.hostname.endsWith('localhost')
    ? 'http://localhost:5173'
    : 'https://rowo.link';

export function mainSiteUrl(path = ''): string {
  return MAIN_SITE_ORIGIN + path;
}

export function startSsoLogin(returnTo: string): void {
  const here = window.location.origin + '/sso-callback' +
    (returnTo ? '?to=' + encodeURIComponent(returnTo) : '');
  window.location.href = MAIN_SITE_ORIGIN + '/sso?next=' + encodeURIComponent(here);
}
