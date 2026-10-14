#!/usr/bin/env node
/**
 * Keep exactly one GitHub Issue in step with the link report.
 *
 * One issue, reopened and edited rather than replaced, so the thread holds the
 * whole story instead of a new issue appearing every Monday. It is raised when
 * a link is broken, or has been unverifiable three runs running, and closed
 * with a note when everything recovers.
 *
 * Run: node scripts/sync-broken-link-issue.mjs   (needs GITHUB_TOKEN)
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { api, repoCoordinates } from './github-api.mjs';
import { needsAttention, OUTCOME, OUTCOME_IS } from './check-links.mjs';

// ---- rendering --------------------------------------------------------------
//
// Pure, and exported so the tests can render a body without touching GitHub.

export function issueBody(fullReport, list) {
  const broken = list.filter((l) => l.outcome === OUTCOME.BROKEN);
  const unknown = list.filter((l) => l.outcome === OUTCOME.UNKNOWN);

  const rows = list.map((l) => [
    `| ${l.outcome === OUTCOME.BROKEN ? '❌' : '⚠️'} ${OUTCOME_IS[l.outcome]}`,
    escapeCell(l.label),
    `[slóð](${l.href})`,
    l.status ?? l.errorCode ?? l.note ?? '—',
    `${l.consecutiveFailures}× í röð`,
  ].join(' | ') + ' |');

  const changed = fullReport.links.filter((l) => l.lastModifiedChanged);

  return [
    `Sjálfvirk vöktun fann ${list.length} hlekk(i) sem þarf að skoða.`,
    '',
    `Síðast athugað: ${formatTime(fullReport.generatedAt)}`,
    '',
    '| Staða | Skjal | Slóð | Svar | Hversu oft |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    broken.length
      ? `### ❌ ${broken.length} bilaður/bilaðir\nVefþjónninn svaraði að skjalið sé ekki til (404/410), `
        + 'lénið fannst ekki, eða skírteinið er ógilt. Þetta þarf að laga: finndu nýju slóðina og '
        + 'uppfærðu hana í stjórnborðinu.'
      : '',
    unknown.length
      ? `### ⚠️ ${unknown.length} óviss\nVefþjónninn svaraði ekki, hafnaði beiðninni eða tók of langan tíma `
        + `${unknown[0].consecutiveFailures} skipti í röð. Oftast þýðir það að vefþjónninn hleypir GitHub ekki inn `
        + '— prófaðu slóðina í vafra áður en þú breytir nokkru.'
      : '',
    changed.length
      ? `### 📄 ${changed.length} skjal hefur breyst\nSama slóð en nýtt skjal á vefþjóninum (Last-Modified breyttist). `
        + 'Slóðin virkar, en innihaldið gæti verið annað en þið lögðuð upp með.\n\n'
        + changed.map((l) => `- ${escapeCell(l.label)}: ${l.previousLastModified} → ${l.lastModified}`).join('\n')
      : '',
    '',
    '---',
    '<sub>Þetta mál er uppfært sjálfvirkt í hverri vikulegri athugun og lokast af sjálfu sér '
    + 'þegar allir hlekkir eru komnir í lag. Ekki loka því handvirkt.</sub>',
  ].filter(Boolean).join('\n');
}

export function closingComment(fullReport) {
  return [
    '✅ Allir hlekkir svara eðlilega aftur.',
    '',
    `Athugað ${formatTime(fullReport.generatedAt)}: `
    + `${fullReport.summary.ok} í lagi, ${fullReport.summary.redirect} áframsendingar, `
    + `${fullReport.summary.empty} án hlekks.`,
    '',
    '<sub>Málinu er lokað sjálfvirkt. Það opnast aftur ef eitthvað bilar.</sub>',
  ].join('\n');
}

/** 24-hour clock, Icelandic time zone — never AM/PM. */
function formatTime(iso) {
  if (!iso) return 'óþekkt';
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('is-IS', {
    timeZone: 'Atlantic/Reykjavik',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}.${get('month')}.${get('year')} kl. ${get('hour')}:${get('minute')}`;
}

async function ensureLabel({ owner, repo, label }) {
  try {
    await api(`/repos/${owner}/${repo}/labels/${encodeURIComponent(label)}`);
  } catch {
    try {
      await api(`/repos/${owner}/${repo}/labels`, {
        method: 'POST',
        body: { name: label, color: 'd73a4a', description: 'Sjálfvirk vöktun fann hlekk sem virkar ekki' },
      });
    } catch (error) {
      console.log(`::warning::Gat ekki búið til merkimiðann "${label}": ${error.message}`);
    }
  }
}

/** A `|` inside a label would split the Markdown table cell. */
function escapeCell(text) {
  return String(text).replace(/\|/g, '\\|');
}

// ---- the run ----------------------------------------------------------------

async function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const config = JSON.parse(await readFile(`${root}site.config.json`, 'utf8'));
  const reportPath = `${root}${config.paths.linkStatus}`;

  if (!existsSync(reportPath)) {
    console.log('Engin hlekkjaskýrsla til — ekkert að gera.');
    return;
  }
  if (!process.env.GITHUB_TOKEN) {
    console.log('GITHUB_TOKEN vantar — sleppi samstillingu við GitHub-mál.');
    return;
  }

  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const problems = needsAttention(report);
  const { owner, repo } = repoCoordinates();
  const title = config.brokenLinkIssueTitle;
  const label = config.brokenLinkIssueLabel;

  await ensureLabel({ owner, repo, label });

  // Search rather than list-and-filter: the repo may accumulate many issues.
  const found = await api(
    `/search/issues?q=${encodeURIComponent(`repo:${owner}/${repo} is:issue in:title "${title}"`)}`,
  );
  const existing = found.items?.find((issue) => issue.title === title) ?? null;

  if (problems.length === 0) {
    if (existing && existing.state === 'open') {
      await api(`/repos/${owner}/${repo}/issues/${existing.number}/comments`, {
        method: 'POST',
        body: { body: closingComment(report) },
      });
      await api(`/repos/${owner}/${repo}/issues/${existing.number}`, {
        method: 'PATCH',
        body: { state: 'closed', state_reason: 'completed' },
      });
      console.log(`✅ Allir hlekkir í lagi — lokaði máli #${existing.number}.`);
    } else {
      console.log('✅ Allir hlekkir í lagi — ekkert mál opið.');
    }
    return;
  }

  const body = issueBody(report, problems);

  if (existing) {
    await api(`/repos/${owner}/${repo}/issues/${existing.number}`, {
      method: 'PATCH',
      body: { body, state: 'open', labels: [label] },
    });
    console.log(`⚠️  ${problems.length} hlekkur/hlekkir í ólagi — uppfærði mál #${existing.number}.`);
  } else {
    const created = await api(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: { title, body, labels: [label] },
    });
    console.log(`⚠️  ${problems.length} hlekkur/hlekkir í ólagi — opnaði mál #${created.number}.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
