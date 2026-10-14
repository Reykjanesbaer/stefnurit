/**
 * Icelandic formatting.
 *
 * Every time shown anywhere in this panel goes through here. The 24-hour clock
 * is a hard rule — "kl. 14:30", never "2:30 PM" — and centralising it is the
 * only way to be sure of that across nine views.
 */

const TIME_ZONE = 'Atlantic/Reykjavik';

const parts = (date, options) =>
  new Intl.DateTimeFormat('is-IS', { timeZone: TIME_ZONE, hour12: false, ...options })
    .formatToParts(date)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});

const asDate = (value) => (value instanceof Date ? value : new Date(value));

/** "14.10.2026 kl. 14:30" */
export function formatDateTime(value) {
  if (!value) return 'óþekkt';
  const date = asDate(value);
  if (Number.isNaN(date.getTime())) return 'óþekkt';
  const p = parts(date, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  return `${p.day}.${p.month}.${p.year} kl. ${p.hour}:${p.minute}`;
}

/** "14:30" — for "Vistað á þessu tæki 14:30" */
export function formatTime(value) {
  if (!value) return '';
  const date = asDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const p = parts(date, { hour: '2-digit', minute: '2-digit' });
  return `${p.hour}:${p.minute}`;
}

/** "14.10.2026" */
export function formatDate(value) {
  if (!value) return 'óþekkt';
  const date = asDate(value);
  if (Number.isNaN(date.getTime())) return 'óþekkt';
  const p = parts(date, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.day}.${p.month}.${p.year}`;
}

/** "fyrir 3 mínútum", "í gær", "fyrir 2 vikum" — with the exact time as the title. */
export function formatRelative(value) {
  if (!value) return 'óþekkt';
  const date = asDate(value);
  if (Number.isNaN(date.getTime())) return 'óþekkt';

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return 'rétt í þessu';
  if (seconds < 90) return 'fyrir mínútu';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `fyrir ${minutes} mínútum`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'fyrir klukkustund' : `fyrir ${hours} klukkustundum`;

  const days = Math.round(hours / 24);
  if (days === 1) return 'í gær';
  if (days < 7) return `fyrir ${days} dögum`;

  const weeks = Math.round(days / 7);
  if (weeks < 5) return weeks === 1 ? 'fyrir viku' : `fyrir ${weeks} vikum`;

  const months = Math.round(days / 30);
  if (months < 12) return months === 1 ? 'fyrir mánuði' : `fyrir ${months} mánuðum`;

  const years = Math.round(days / 365);
  return years === 1 ? 'fyrir ári' : `fyrir ${years} árum`;
}

/** "3 skjöl" — Icelandic counts, where 1 and anything ending in 1 but not 11 is singular. */
export function plural(count, one, many) {
  const n = Math.abs(count);
  const isOne = n % 10 === 1 && n % 100 !== 11;
  return `${count} ${isOne ? one : many}`;
}

/** "1,2 MB" */
export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(1).replace('.', ',')} ${units[unit]}`;
}
