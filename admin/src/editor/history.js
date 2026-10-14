/**
 * Undo/redo for the editor.
 *
 * Snapshots rather than inverse operations: the document is a few kilobytes,
 * the edits are human-paced, and a snapshot stack cannot drift out of step with
 * the document the way a hand-written inverse of "move card across columns"
 * eventually would.
 *
 * Typing is coalesced — holding a key down must not fill the stack with one
 * entry per character — but every structural change is its own step.
 */
export class History {
  #past = [];
  #future = [];
  #present;
  #limit;
  #lastLabel = null;
  #lastAt = 0;
  #coalesceMs;

  constructor(initial, { limit = 60, coalesceMs = 600 } = {}) {
    this.#present = structuredClone(initial);
    this.#limit = limit;
    this.#coalesceMs = coalesceMs;
  }

  get current() { return this.#present; }
  get canUndo() { return this.#past.length > 0; }
  get canRedo() { return this.#future.length > 0; }
  get depth() { return this.#past.length; }

  /**
   * @param {object} next
   * @param {string} label  what changed, e.g. "label:innkaupastefna"
   * @param {{coalesce?: boolean}} options
   */
  push(next, label = '', { coalesce = false } = {}) {
    const now = Date.now();
    const merges = coalesce
      && label !== ''
      && label === this.#lastLabel
      && now - this.#lastAt < this.#coalesceMs;

    if (!merges) {
      this.#past.push(this.#present);
      if (this.#past.length > this.#limit) this.#past.shift();
    }

    this.#present = structuredClone(next);
    this.#future = [];        // a new edit abandons the redo branch
    this.#lastLabel = label;
    this.#lastAt = now;
    return this.#present;
  }

  undo() {
    if (!this.canUndo) return null;
    this.#future.push(this.#present);
    this.#present = this.#past.pop();
    this.#lastLabel = null;   // never coalesce across an undo
    return this.#present;
  }

  redo() {
    if (!this.canRedo) return null;
    this.#past.push(this.#present);
    this.#present = this.#future.pop();
    this.#lastLabel = null;
    return this.#present;
  }

  /** Start again from a new base — after a save, or after a merge. */
  reset(document) {
    this.#past = [];
    this.#future = [];
    this.#present = structuredClone(document);
    this.#lastLabel = null;
  }
}
