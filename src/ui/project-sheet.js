// The printable project sheet, and the book of projects: plain HTML strings
// with their own stylesheet, so the same page is printed (Save as PDF),
// downloaded as a standalone .html file, or bound into a book with a chapter
// per project. Images come in as data URLs (project-export.js makes them), so
// nothing here needs the network or a canvas, and tests can run it in Node.

import { escapeHtml as e } from './html.js';
import { statusName, kindName, comparison, coverPhoto } from '../core/project.js';
import { withWarpDefaults } from '../core/warp-plan.js';

const has = (v) => v !== '' && v != null;
const round = (n, p = 1) => Math.round(n * 10 ** p) / 10 ** p;
export const inches = (n) => (has(n) ? `${round(Number(n), 2).toLocaleString()} in` : '');
const pct = (f) => (f == null ? '—' : `${round(f * 100, 1)}%`);
const yd = (n) => (has(n) && n !== 0 ? `${Math.ceil(n).toLocaleString()} yd` : '');
export function day(d) {
  if (!d) return '';
  const t = typeof d === 'number' ? new Date(d) : new Date(`${d}T12:00:00`);
  return Number.isNaN(t.getTime()) ? String(d) : t.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}
const para = (text) => String(text).split(/\n{2,}/).map((p) => `<p>${e(p).replace(/\n/g, '<br>')}</p>`).join('');
const facts = (pairs) => {
  const items = pairs.filter(([, v]) => has(v));
  return items.length ? `<dl class="sheet-facts">${items.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}</dl>` : '';
};
const figure = (src, caption, cls = '') => (src ? `<figure class="${cls}"><img src="${e(src)}" alt="${e(caption || '')}">${caption ? `<figcaption>${e(caption)}</figcaption>` : ''}</figure>` : '');

/**
 * One project as an <article>. images: { drawdown, draft, wif, photos: { id: url } }.
 * chapter: a number to show "Chapter n" (in a book).
 */
export function projectSheetHtml(project, { images = {}, chapter = null } = {}) {
  const p = project;
  const s = p.snapshot ?? {};
  const plan = s.plan;
  const w = withWarpDefaults(s.warpPlan);
  const draft = s.draft;
  const loom = s.loom;
  const photos = images.photos ?? {};
  const cover = coverPhoto(p);
  const coverUrl = cover ? photos[cover.id] : null;
  const dates = [p.started && `Started ${day(p.started)}`, p.completed && `finished ${day(p.completed)}`].filter(Boolean).join(', ');

  const head = `
    <header class="sheet-head">
      ${chapter != null ? `<p class="sheet-chapter">Chapter ${chapter}</p>` : ''}
      <h1>${e(p.title || 'Untitled project')}</h1>
      <p class="sheet-sub">${e(statusName(p.status))}${dates ? ` · ${e(dates)}` : ''}${p.basedOn ? ` · based on “${e(p.basedOn.title)}”` : ''}</p>
      ${p.tags.length ? `<p class="sheet-tags">${p.tags.map((t) => `<span>${e(t)}</span>`).join(' ')}</p>` : ''}
    </header>`;

  const pictures = (coverUrl || images.drawdown) ? `
    <div class="sheet-pictures">
      ${figure(coverUrl, cover?.caption, 'sheet-cover')}
      ${figure(images.drawdown, 'Drawdown', 'sheet-drawdown')}
    </div>` : '';

  const planFacts = facts([
    ['Loom', loom ? `${loom.name}${loom.shafts ? `, ${loom.shafts} shafts` : ''}${loom.treadles ? `, ${loom.treadles} treadles` : ''}` : ''],
    ['Draft', draft ? `${draft.shafts} shafts, ${draft.treadles} treadles${draft.mode === 'liftplan' ? ' (liftplan)' : ''}` : ''],
    ['Warp yarn', s.warpYarnName],
    ['Weft yarn', s.weftYarnName],
    ['Sett', s.epi ? `${s.epi} ends per inch` : ''],
    ['Picks per inch', s.ppi ? String(s.ppi) : ''],
    ['Ends', plan ? String(plan.ends) : ''],
    ['Width in reed', plan ? inches(plan.widthInReed) : ''],
    ['Warp length', plan ? `${round(plan.warpLength / 36, 1)} yd (${Math.round(plan.warpLength)} in)` : ''],
    ['Pieces', String(w.pieces)],
    ['Planned finished size', `${inches(w.finishedWidth)} × ${inches(w.finishedLength)}`],
    ['Hems or fringe per piece', inches(w.allowance)],
    ['Warp yarn needed', plan ? yd(plan.warp.yards) : ''],
    ['Weft yarn needed', plan ? yd(plan.weft.yards) : ''],
  ]);
  const planSection = `
    <section class="sheet-plan">
      <h2>The plan</h2>
      ${planFacts}
      ${figure(images.draft, draft?.mode === 'liftplan' ? 'Threading and liftplan' : 'Threading, tie-up and treadling', 'sheet-draft')}
      ${draft?.meta?.source ? `<p class="sheet-muted">Draft source: ${e(draft.meta.source)}${draft.meta.sourceYear ? ` (${e(draft.meta.sourceYear)})` : ''}</p>` : ''}
    </section>`;

  const m = p.measurements;
  // The width in the reed is filled in from the plan; anything else was measured.
  const anyMeasure = Object.entries(m).some(([k, v]) => k !== 'widthInReed' && has(v));
  const cmp = comparison(p);
  const measureSection = anyMeasure ? `
    <section class="sheet-measure">
      <h2>Measurements</h2>
      <table>
        <thead><tr><th>Stage</th><th>Width</th><th>Length (per piece)</th></tr></thead>
        <tbody>
          <tr><th>In the reed</th><td>${inches(m.widthInReed)}</td><td></td></tr>
          <tr><th>On the loom, under tension</th><td>${inches(m.widthOnLoom)}</td><td>${inches(m.lengthWovenOnLoom)}</td></tr>
          <tr><th>Off the loom, before finishing</th><td>${inches(m.widthOffLoom)}</td><td>${inches(m.lengthOffLoom)}</td></tr>
          <tr><th>After wet finishing</th><td>${inches(m.widthFinished)}</td><td>${inches(m.lengthFinished)}</td></tr>
        </tbody>
      </table>
      ${has(m.ppiActual) ? `<p>Picks per inch, as woven: ${e(m.ppiActual)}${s.ppi ? ` (planned ${e(s.ppi)})` : ''}.</p>` : ''}
      <table>
        <thead><tr><th></th><th>Planned</th><th>Measured</th></tr></thead>
        <tbody>
          ${cmp.rows.map((r) => `<tr><th>${e(r.label)}</th><td>${pct(r.planned)}</td><td>${pct(r.measured)}</td></tr>`).join('')}
          ${cmp.sizes.map((r) => `<tr><th>${e(r.label)}</th><td>${inches(r.planned)}</td><td>${has(r.measured) ? inches(r.measured) : '—'}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>` : '';

  const yarns = p.yarns.filter((y) => has(y.name) || has(y.brand) || has(y.colorName) || has(y.used));
  const yarnSection = yarns.length ? `
    <section class="sheet-yarn">
      <h2>Yarns</h2>
      <table>
        <thead><tr><th>For</th><th>Yarn</th><th>Brand</th><th>Color</th><th>Dye lot</th><th>Planned</th><th>Used</th><th>Left over</th><th>Cost</th></tr></thead>
        <tbody>${yarns.map((y) => `<tr>
          <td>${e(y.role === 'other' ? 'Other' : y.role === 'warp' ? 'Warp' : 'Weft')}</td>
          <td>${e(y.name)}</td><td>${e(y.brand)}</td>
          <td>${y.colorHex ? `<span class="sheet-swatch" style="background:${e(y.colorHex)}"></span> ` : ''}${e(y.colorName)}</td>
          <td>${e(y.dyeLot)}</td><td>${yd(y.plannedYards)}</td><td>${e(y.used)}</td><td>${e(y.leftover)}</td><td>${e(y.cost)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </section>` : '';

  const f = p.finishing;
  const finishFacts = facts([
    ['Method', f.method], ['Water', f.waterTemp], ['Agitation', f.agitation],
    ['Time', has(f.minutes) ? `${f.minutes} minutes` : ''], ['Drying', f.drying], ['Pressing', f.pressing], ['Hems or fringe', f.edges],
  ]);
  const finishSection = finishFacts || has(f.notes) ? `
    <section class="sheet-finish">
      <h2>Wet finishing</h2>
      ${finishFacts}
      ${has(f.notes) ? para(f.notes) : ''}
    </section>` : '';

  const extraFacts = facts([['Hours', p.hours], ['Cost of materials', p.cost], ['Made for', p.recipient]]);
  const extraSection = extraFacts ? `<section class="sheet-extra"><h2>Time and cost</h2>${extraFacts}</section>` : '';

  const shown = new Set(cover ? [cover.id] : []);
  const journal = [...p.journal].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const journalSection = journal.length ? `
    <section class="sheet-journal">
      <h2>Journal</h2>
      ${journal.map((j) => {
        const pics = (j.photoIds ?? []).filter((id) => photos[id]);
        pics.forEach((id) => shown.add(id));
        return `<div class="sheet-entry">
          <h3>${e(day(j.date))} · ${e(kindName(j.kind))}</h3>
          ${has(j.text) ? para(j.text) : ''}
          ${pics.length ? `<div class="sheet-gallery">${pics.map((id) => figure(photos[id], p.photos.find((ph) => ph.id === id)?.caption)).join('')}</div>` : ''}
        </div>`;
      }).join('')}
    </section>` : '';

  const rest = p.photos.filter((ph) => !shown.has(ph.id) && photos[ph.id]);
  const photoSection = rest.length ? `
    <section class="sheet-photos">
      <h2>Photos</h2>
      <div class="sheet-gallery">${rest.map((ph) => figure(photos[ph.id], ph.caption)).join('')}</div>
    </section>` : '';
  const missing = p.photos.length && !Object.keys(photos).length
    ? `<p class="sheet-muted">${p.photos.length} photo${p.photos.length === 1 ? '' : 's'} not included (sign in to include photos).</p>` : '';

  const notes = has(p.notes) ? `<section><h2>Notes</h2>${para(p.notes)}</section>` : '';
  const lessons = has(p.lessons) ? `<section><h2>Lessons learned</h2>${para(p.lessons)}</section>` : '';
  const wif = images.wif ? `<p class="sheet-muted sheet-noprint"><a href="${e(images.wif)}" download="${e(p.title || 'draft')}.wif">Download the draft (.wif)</a></p>` : '';

  return `<article class="sheet" id="project-${e(p.id)}">${head}${pictures}${planSection}${measureSection}${yarnSection}${finishSection}${extraSection}${journalSection}${photoSection}${missing}${notes}${lessons}${wif}</article>`;
}

/**
 * The whole book: a title page, contents, one chapter per project, and an
 * index of the yarns used. imagesFor(project) gives that project's images.
 */
export function bookHtml(projects, { title = 'My Weaving Projects', subtitle = '', imagesFor = () => ({}), now = Date.now() } = {}) {
  const chapters = projects.map((p, i) => projectSheetHtml(p, { images: imagesFor(p), chapter: i + 1 }));
  const index = new Map(); // yarn label -> Set of chapter numbers
  projects.forEach((p, i) => {
    for (const y of p.yarns) {
      const label = [y.name, y.brand, y.colorName].filter(has).join(', ');
      if (!label) continue;
      if (!index.has(label)) index.set(label, new Set());
      index.get(label).add(i + 1);
    }
  });
  const yarnIndex = index.size ? `
    <section class="book-index">
      <h1>Yarns used</h1>
      <ul>${[...index].sort(([a], [b]) => a.localeCompare(b)).map(([label, ch]) =>
        `<li>${e(label)} <span class="sheet-muted">— chapter${ch.size === 1 ? '' : 's'} ${[...ch].map((n) => `<a href="#project-${e(projects[n - 1].id)}">${n}</a>`).join(', ')}</span></li>`).join('')}</ul>
    </section>` : '';
  return `
    <section class="book-title">
      <h1>${e(title)}</h1>
      ${subtitle ? `<p class="book-subtitle">${e(subtitle)}</p>` : ''}
      <p class="sheet-muted">${projects.length} project${projects.length === 1 ? '' : 's'} · ${e(day(now))}</p>
    </section>
    <nav class="book-toc">
      <h1>Contents</h1>
      <ol>${projects.map((p) => `<li><a href="#project-${e(p.id)}">${e(p.title || 'Untitled project')}</a> <span class="sheet-muted">${e(statusName(p.status))}${p.completed ? `, ${e(day(p.completed))}` : ''}</span></li>`).join('')}</ol>
    </nav>
    ${chapters.join('\n')}
    ${yarnIndex}`;
}

/** A complete standalone document around a sheet or book. */
export function sheetDocument(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<style>${SHEET_CSS}</style>
</head>
<body>
${body}
<footer class="sheet-footer">Recorded with Loomination · loomination.org</footer>
</body>
</html>`;
}

export const SHEET_CSS = `
@page { size: auto; margin: 16mm 14mm; }
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0 auto; max-width: 52rem; padding: 24px 16px; font: 11pt/1.45 Georgia, "Times New Roman", serif; color: #1d1b18; background: #fff; }
h1, h2, h3 { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.2; }
h1 { font-size: 22pt; margin: 0 0 4pt; }
h2 { font-size: 13pt; margin: 18pt 0 6pt; padding-bottom: 3pt; border-bottom: 1px solid #bbb; }
h3 { font-size: 10.5pt; margin: 10pt 0 2pt; }
h1, h2, h3, .sheet-entry h3 + p { break-after: avoid; }
p { margin: 4pt 0; }
a { color: #8a3b12; }
.sheet + .sheet, .book-toc + .sheet, .book-index { break-before: page; }
.sheet { margin-bottom: 36pt; }
.sheet-chapter { font: 600 9pt system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.12em; color: #8a3b12; margin: 0 0 2pt; }
.sheet-sub, .sheet-muted { color: #5c564e; }
.sheet-muted { font-size: 9pt; }
.sheet-tags span { display: inline-block; font: 8.5pt system-ui, sans-serif; padding: 1pt 6pt; border: 1px solid #ccc; border-radius: 99px; margin-right: 3pt; }
.sheet-pictures { display: flex; gap: 12pt; align-items: flex-start; margin: 12pt 0; }
.sheet-pictures figure { margin: 0; }
.sheet-cover { flex: 2; }
.sheet-cover img { width: 100%; max-height: 110mm; object-fit: contain; }
.sheet-drawdown { flex: 1; max-width: 70mm; }
.sheet-drawdown img, .sheet-draft img { image-rendering: pixelated; border: 1px solid #ccc; }
.sheet-drawdown img { width: 100%; }
.sheet-draft { margin: 8pt 0; }
.sheet-draft img { max-width: 100%; max-height: 150mm; }
figure { margin: 0; break-inside: avoid; }
figcaption { font-size: 9pt; color: #5c564e; margin-top: 2pt; }
.sheet-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 4pt 14pt; margin: 6pt 0; }
.sheet-facts div { break-inside: avoid; }
.sheet-facts dt { font: 7.5pt system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.06em; color: #6b645b; }
.sheet-facts dd { margin: 0; }
table { border-collapse: collapse; margin: 6pt 0 10pt; font-size: 9.5pt; break-inside: avoid; }
th, td { border: 1px solid #c8c2b8; padding: 2pt 6pt; text-align: left; vertical-align: top; }
thead th { font: 600 8pt system-ui, sans-serif; color: #5c564e; background: #f4f1ec; }
tbody th { font-weight: normal; color: #3d3934; }
.sheet-swatch { display: inline-block; width: 9pt; height: 9pt; border: 1px solid #999; border-radius: 50%; vertical-align: -1pt; }
.sheet-entry { break-inside: avoid; }
.sheet-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(52mm, 1fr)); gap: 8pt; margin: 6pt 0; }
.sheet-gallery img { width: 100%; max-height: 80mm; object-fit: cover; }
.book-title { min-height: 60vh; display: flex; flex-direction: column; justify-content: center; text-align: center; }
.book-title h1 { font-size: 34pt; }
.book-subtitle { font-size: 14pt; }
.book-toc { break-before: page; }
.book-toc ol { padding-left: 1.4em; }
.book-toc li { margin: 4pt 0; }
.book-index ul { columns: 2; padding-left: 1em; }
.sheet-footer { margin-top: 24pt; font: 8pt system-ui, sans-serif; color: #8c8478; text-align: center; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media print {
  body { max-width: none; padding: 0; }
  .sheet-noprint { display: none; }
  a { color: inherit; text-decoration: none; }
}
`;
