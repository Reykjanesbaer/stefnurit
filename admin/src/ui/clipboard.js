/**
 * Copy text, and say honestly whether it worked.
 *
 * The Clipboard API needs a secure context and a user gesture, and a browser may
 * still refuse it. Returning false rather than throwing lets the caller fall
 * back to showing the text selected, which is one keystroke from the same result.
 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Select every character inside a node, so Ctrl+C takes it. */
export function selectContents(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}
