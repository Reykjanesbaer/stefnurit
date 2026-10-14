# Embedding the stefnurit

Two ways. Pick the script tag unless the CMS forbids it.

## 1. Script tag (recommended)

```html
<script type="module" src="https://reykjanesbaer.github.io/stefnurit/dist/stefnu-rit.js"></script>

<style>
  /* Reserve the box so the page does not jump while the script loads. */
  stefnu-rit:not([data-ready]) { display: block; min-height: 56rem; }
  @media (max-width: 1399px) {
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

Use this when the CMS will not run third-party script at all.

```html
<iframe
  id="stefnurit"
  src="https://reykjanesbaer.github.io/stefnurit/embed/frame.html?parent=https://www.reykjanesbaer.is"
  title="Stefnurit Reykjanesbæjar"
  loading="lazy"
  style="width:100%;border:0;height:900px"></iframe>

<script>
  // The frame cannot resize itself, so it posts its height. Check the origin:
  // without that check any page could post a message and resize your iframe.
  window.addEventListener('message', function (event) {
    if (event.origin !== 'https://reykjanesbaer.github.io') return;
    if (!event.data || event.data.type !== 'stefnu-rit:height') return;

    var frame = document.getElementById('stefnurit');
    var height = Number(event.data.height);
    if (frame && height > 0 && height < 20000) {
      frame.style.height = height + 'px';
    }
  });
</script>
```

The `?parent=` value must be listed in
[`embed/embed-config.json`](../embed/embed-config.json). An unlisted origin gets
no messages at all — the frame still renders, it simply will not resize itself.
Add new sites to that file and publish; it is part of the normal review flow.

Height messages are posted to that exact origin, never to `'*'`.

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
