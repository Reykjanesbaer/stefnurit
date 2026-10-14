/**
 * DOM helpers.
 *
 * There is deliberately no `html` template function here and no use of
 * `innerHTML` anywhere in the panel. Every string that reaches the page comes
 * from the document being edited or from the GitHub API, and both are things a
 * person can type into. `textContent` makes the question moot rather than
 * leaving it to a sanitiser somebody has to keep correct.
 */

/**
 * Create an element.
 *
 * @param {string} tag
 * @param {object} [props]  class, text, attrs, dataset, aria, on, …
 * @param {Array<Node|string|null|undefined|false>} [children]
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') throw new Error('el(): refusing to set innerHTML — use text or children');
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key === 'on') {
      for (const [event, handler] of Object.entries(value)) node.addEventListener(event, handler);
    } else if (key === 'href' || key === 'src') {
      // Never let a document-supplied URL become javascript: or data:.
      const safe = safeUrl(value);
      if (safe) node.setAttribute(key, safe);
    } else if (key in node && typeof node[key] !== 'object') {
      node[key] = value;
    } else {
      node.setAttribute(key, String(value));
    }
  }

  append(node, children);
  return node;
}

export function append(parent, children) {
  for (const child of [children].flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === '') continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.firstChild.remove();
  return node;
}

/**
 * Allow only http(s) and same-document fragments.
 * Returns null for anything else, so the attribute is simply not set.
 */
export function safeUrl(value) {
  const text = String(value).trim();
  if (text.startsWith('#')) return text;
  if (/^https?:\/\//i.test(text)) return text;
  // Relative paths inside the panel itself are fine; a scheme is not.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) return text;
  console.warn('[stjórnborð] refusing unsafe URL:', text);
  return null;
}

/** An external link that cannot be used to reach back into this page. */
export function externalLink(href, text, props = {}) {
  return el('a', {
    href, text, target: '_blank', rel: 'noopener noreferrer external', ...props,
  });
}

/** A labelled field; the label is tied to the control by id. */
export function field(id, labelText, control, hint) {
  return el('div', { class: 'field' }, [
    el('label', { for: id, text: labelText }),
    control,
    hint ? el('p', { class: 'hint', text: hint, id: `${id}-hint` }) : null,
  ]);
}

/** Announce something to a screen reader without moving focus. */
export function announce(message, politeness = 'polite') {
  let region = document.getElementById(`sr-live-${politeness}`);
  if (!region) {
    region = el('div', {
      id: `sr-live-${politeness}`, class: 'visually-hidden',
      role: 'status', 'aria-live': politeness, 'aria-atomic': 'true',
    });
    document.body.append(region);
  }
  region.textContent = '';
  // A same-text update is not announced unless the node actually changes.
  requestAnimationFrame(() => { region.textContent = message; });
}
