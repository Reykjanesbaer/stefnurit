/**
 * The iframe embed.
 *
 * An iframe cannot size itself to its content, so the frame measures itself and
 * tells the parent page how tall to make it. The parent is checked against an
 * allowlist first: posting to '*' would hand any page that frames this a live
 * feed of the widget's dimensions, and there is no reason to.
 */
import '../src/stefnu-rit.js';

const config = await fetch(new URL('./embed-config.json', import.meta.url))
  .then((response) => response.json())
  .catch(() => ({ allowedParentOrigins: [], developmentOrigins: [] }));

const allowed = new Set([
  ...(config.allowedParentOrigins ?? []),
  ...(config.developmentOrigins ?? []),
]);

/**
 * Decide who, if anyone, we are allowed to talk to.
 *
 * `?parent=` names the origin; it is only honoured if it is on the list, so a
 * crafted URL cannot redirect the messages somewhere else.
 */
function resolveParentOrigin() {
  const asked = new URL(location.href).searchParams.get('parent');
  if (asked) {
    try {
      const origin = new URL(asked).origin;
      if (allowed.has(origin)) return origin;
      console.warn('[stefnu-rit embed] refusing unlisted parent origin:', origin);
      return null;
    } catch {
      return null;
    }
  }
  // document.referrer is what the browser reports, so it cannot be spoofed by
  // the query string — but it is empty when the referrer policy hides it.
  try {
    const origin = new URL(document.referrer).origin;
    return allowed.has(origin) ? origin : null;
  } catch {
    return null;
  }
}

const parentOrigin = resolveParentOrigin();
const widget = document.getElementById('rit');

let lastHeight = 0;
function publishHeight() {
  if (!parentOrigin || window.parent === window) return;
  const height = Math.ceil(document.documentElement.getBoundingClientRect().height);
  // A one-pixel jitter would otherwise post on every animation frame.
  if (Math.abs(height - lastHeight) < 2) return;
  lastHeight = height;
  window.parent.postMessage({ type: 'stefnu-rit:height', height }, parentOrigin);
}

new ResizeObserver(publishHeight).observe(document.documentElement);
widget.addEventListener('sr-link-click', (event) => {
  if (!parentOrigin) return;
  window.parent.postMessage({ type: 'stefnu-rit:link', ...event.detail }, parentOrigin);
});
document.fonts?.ready.then(publishHeight);
publishHeight();
