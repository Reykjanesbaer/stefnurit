# Embedding the stefnurit

Two ways. Pick the script tag unless the CMS forbids it.

## 1. Script tag (recommended)

```html
<script type="module" src="https://reykjanesbaer.github.io/stefnurit/dist/stefnu-rit.js"></script>

<style>
  /* Reserve the box so the page does not jump while the script loads. */
  stefnu-rit:not([data-ready]) { display: block; min-height: 56rem; }
  @media (max-width: 922px) {
    stefnu-rit:not([data-ready]) { min-height: 82rem; }
  }
</style>

<stefnu-rit
  src="https://reykjanesbaer.github.io/stefnurit/src/data/stefnurit.json"
  fallback-href="https://www.reykjanesbaer.is/is/stjornsysla/stefnumotun"></stefnu-rit>
```

For a CMS that cannot emit `type="module"`:

```html
<script src="https://reykjanesbaer.github.io/stefnurit/dist/stefnu-rit.iife.js"></script>
```

### Attributes

| | |
|---|---|
| `src` | The JSON document. Same origin, or a server sending `Access-Control-Allow-Origin`. |
| `fallback-src` | Tried if `src` fails or is invalid. |
| `fallback-href` | Where to send people if nothing loads at all. |
| `target` | Link target, `_blank` by default. |
| `debug` | Renders the technical reason into the page. Never set it in production. |
| `.config` | Property: render from an object and skip the fetch entirely. |

### What happens when something goes wrong

The widget never shows a status code to a resident. In order: `src`, then
`fallback-src`, then the last document that was known good in that browser's
`localStorage` — with `data-stale="true"` on the element and a line saying so.
If there is nothing at all, it shows a short Icelandic message and the
`fallback-href` link. The technical detail goes to `console.error`.

An invalid document is never cached and never rendered, so a bad publish cannot
poison the copy that is keeping the page alive.

### Counting clicks

```js
document.querySelector('stefnu-rit').addEventListener('sr-link-click', (event) => {
  const { id, label, href } = event.detail;
  // hand to whatever analytics the site uses
});
```

The event bubbles and is `composed`, so a listener on an ancestor works too.

## 2. Iframe

Use this when the CMS will not run third-party script at all — Payload's
embed/HTML blocks are the usual case.

**The quick way:** sign in to the admin panel and press **Afrita iframe** in the
header. It copies the code below to the clipboard, ready to paste. Stillingar →
*Innfelling* has the same code, plus the variants and a height field.

```html
<iframe
  src="https://reykjanesbaer.github.io/stefnurit/embed/frame.html"
  title="Stefnurit Reykjanesbæjar"
  width="100%" height="1000"
  loading="lazy"
  style="border:0;width:100%;max-width:100%"></iframe>
```

The addresses come from [`site.config.json`](../site.config.json) through
`admin/src/embed-snippets.js`; a test checks that every path in them exists.

### Height

An iframe cannot size itself to its content, so the plain snippet has a fixed
height. Measured: about **940 px** with five columns (923 px and wider) and about
**1400 px** once the layout stacks (narrower). `1000` suits a wide column; raise
it to about `1450` when the page that shows it is narrow, or the frame will
scroll inside itself.

For automatic height, the page must run a small script. Stillingar offers that
variant too:

```html
<iframe id="stefnurit-rammi" src="https://reykjanesbaer.github.io/stefnurit/embed/frame.html"
  title="Stefnurit Reykjanesbæjar" width="100%" height="1000" loading="lazy"
  style="border:0;width:100%;max-width:100%"></iframe>
<script>
  window.addEventListener('message', function (event) {
    // Check who sent it: without this any page could resize your iframe.
    if (event.origin !== 'https://reykjanesbaer.github.io') return;
    var frame = document.getElementById('stefnurit-rammi');
    if (!frame || event.source !== frame.contentWindow) return;
    if (!event.data || event.data.type !== 'stefnu-rit:height') return;
    var height = Number(event.data.height);
    if (height > 0 && height < 20000) frame.style.height = height + 'px';
  });
</script>
```

### Who the frame talks to

The frame reports its height only to a page whose origin is listed in
[`embed/embed-config.json`](../embed/embed-config.json), and it learns that
origin from the browser's own `Referer`. A page that is not listed still gets a
working widget; it simply is not told the height. Messages go to that exact
origin, never to `'*'`.

**Add the site that shows the iframe to `allowedParentOrigins`** before relying on
automatic height. The list ships with `https://www.reykjanesbaer.is` and
`https://reykjanesbaer.is`; if Payload renders pages on another host, add it and
publish. A `?parent=` query parameter is still honoured, but only for a listed
origin, so it cannot be used to redirect the messages.

> **Not verified against the live site.** The tests drive a real iframe on a
> host page — one allowlisted origin that is resized, two unlisted ones that get
> nothing — but the frame has not yet been loaded from inside Payload itself.
> Whether Payload's editor keeps an `<iframe>` or strips it depends on how that
> field is configured; check in a draft before publishing.

## Content Security Policy on the host page

The script-tag embed needs:

```
script-src  https://reykjanesbaer.github.io
connect-src https://reykjanesbaer.github.io
style-src   'unsafe-inline'
```

The last one is not negotiable: the widget carries its stylesheet as a `<style>`
element inside its shadow root. Blocking it does not fail loudly — the widget
renders unstyled, which looks like a broken page rather than a blocked one.

The iframe embed needs only `frame-src https://reykjanesbaer.github.io` and no
style allowance at all, because the styles stay inside the frame's own document.
If the host page's CSP is strict and not yours to change, use the iframe.

## Caching

GitHub Pages serves with a CDN that holds assets for up to about ten minutes.
A publish is live on GitHub immediately and on the website shortly after. The
admin panel says the same thing when it reports a successful publish, so nobody
files a bug about a change "not working".

The JSON is served with `cache-control` from Pages' defaults. If a change has to
appear immediately, a hard reload in the browser is enough; there is no cache to
purge and no invalidation step to run.
