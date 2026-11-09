import { test, assert, assertEqual, Skip } from './harness.js';
import { createDraft } from '../src/core/draft.js';
import { straightDraw, straightTreadling, setTieup } from '../src/core/edits.js';
import { planWarp } from '../src/core/warp-calc.js';
import {
  makeSnapshot, newProject, measuredFactors, factorsForPlan, projectFrom, statusAfter, updateSnapshot, normalizeProject,
} from '../src/core/project.js';
import { createMyProjects, projectFileName, projectIdFromFileName, photoFileName } from '../src/ui/my-projects.js';
import { idFromFileName } from '../src/ui/my-drafts.js';
import { projectSheetHtml, bookHtml, sheetDocument } from '../src/ui/project-sheet.js';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

function twillDraft(title = 'Twill towels') {
  let d = createDraft({ shafts: 4, treadles: 4, numEnds: 16, numPicks: 16, palette: [[255, 255, 255], [38, 70, 120]] });
  d = straightDraw(d, { from: 0, to: 15 });
  [[1, 2], [2, 3], [3, 4], [4, 1]].forEach((shafts, t) => shafts.forEach((s) => { d = setTieup(d, s, t + 1, true); }));
  d = straightTreadling(d, { from: 0, to: 15 });
  return { ...d, meta: { ...d.meta, title } };
}

const plan = { finishedWidth: 18, finishedLength: 28, pieces: 2, allowance: 4, sampling: 12, loomWaste: 27, drawIn: 0.05, shrinkWidth: 0.1, takeUp: 0.1, shrinkLength: 0.1, warpYarn: 'cotton-8-2', weftYarn: 'same', epi: 24, ppi: 0 };
const loom = { id: 'main', name: 'Baby Wolf', shafts: 8, treadles: 10 };
const snap = () => makeSnapshot({ draft: twillDraft(), warpPlan: plan, loom, now: Date.parse('2026-11-01T12:00:00Z') });

// ---- the model ----

test('projects: a new project snapshots the plan and lists its yarns', () => {
  const s = snap();
  assertEqual(s.epi, 24);
  assertEqual(s.ppi, 24);
  assertEqual(s.warpYarnName, '8/2 cotton');
  assertEqual(s.weftYarnName, '8/2 cotton');
  assert(s.plan && s.plan.ends > 0, 'plan worked out');
  assert(!('onHand' in s.warpPlan), 'the shopping list is not part of the project');
  const p = newProject(s, { id: 'pabc', now: Date.parse('2026-11-01T12:00:00Z') });
  assertEqual(p.title, 'Twill towels');
  assertEqual(p.status, 'planned');
  assertEqual(p.started, '2026-11-01');
  assertEqual(p.measurements.widthInReed, Math.round(s.plan.widthInReed * 100) / 100);
  assertEqual(p.yarns.map((y) => y.role), ['warp', 'weft']);
  assert(p.yarns.every((y) => y.plannedYards > 0 && y.name === '8/2 cotton'), 'planned yardage per yarn');
});

test('projects: measured factors use the warp plan\'s definitions', () => {
  const f = measuredFactors({ widthInReed: 20, widthOnLoom: 19, widthOffLoom: 18.5, widthFinished: 17.1, lengthWovenOnLoom: 40, lengthOffLoom: 36, lengthFinished: 32.4 });
  assert(near(f.drawIn, 0.05), `draw-in ${f.drawIn}`);
  assert(near(f.shrinkWidth, 0.1), `width ${f.shrinkWidth}`);
  assert(near(f.takeUp, 0.1), `take-up ${f.takeUp}`);
  assert(near(f.shrinkLength, 0.1), `length ${f.shrinkLength}`);
  assert(near(f.widthOverall, 1 - 17.1 / 20), 'overall width');
  assert(near(f.lengthOverall, 1 - 32.4 / 40), 'overall length');
});

test('projects: missing measurements leave their factors out', () => {
  const f = measuredFactors({ widthInReed: 20, widthFinished: 17 });
  assertEqual([f.drawIn, f.shrinkWidth, f.takeUp, f.shrinkLength], [null, null, null, null]);
  assert(near(f.widthOverall, 0.15), 'overall loss needs only the first and last');
  assertEqual(factorsForPlan({ widthInReed: 20, widthFinished: 17 }), {});
  // Cloth that grew counts as 0; more than the plan accepts is capped.
  assertEqual(factorsForPlan({ widthInReed: 20, widthOnLoom: 21, lengthWovenOnLoom: 10, lengthOffLoom: 5 }), { drawIn: 0, takeUp: 0.4 });
});

test('projects: measured factors, planned again, give back the finished size', () => {
  // Weave to a plan, "measure" exactly what the plan predicts, and the factors
  // fed back make the same plan.
  const p = planWarp({ project: plan, epi: 24, ppi: 24 });
  const widthOnLoom = p.widthTarget * (1 - plan.drawIn);
  const lengthOff = p.wovenPerPiece * (1 - plan.takeUp);
  const f = factorsForPlan({
    widthInReed: p.widthTarget, widthOnLoom, widthFinished: widthOnLoom * (1 - plan.shrinkWidth),
    lengthWovenOnLoom: p.wovenPerPiece, lengthOffLoom: lengthOff, lengthFinished: lengthOff * (1 - plan.shrinkLength),
  });
  assertEqual(f, { drawIn: 0.05, shrinkWidth: 0.1, takeUp: 0.1, shrinkLength: 0.1 });
});

test('projects: journal stages move the status forward, never back', () => {
  assertEqual(statusAfter('planned', 'threaded'), 'on-loom');
  assertEqual(statusAfter('on-loom', 'cut-off'), 'off-loom');
  assertEqual(statusAfter('finished', 'threaded'), 'finished');
  assertEqual(statusAfter('off-loom', 'note'), 'off-loom');
  assertEqual(statusAfter('off-loom', 'finished'), 'finished');
});

test('projects: start a new project from one: keeps choices, uses measurements, clears what happened', () => {
  const old = newProject(snap(), { id: 'pold' });
  old.title = 'Blue towels';
  old.status = 'finished';
  old.tags = ['towels'];
  old.measurements = { ...old.measurements, widthInReed: 20, widthOnLoom: 18.8, widthFinished: 16.92, lengthWovenOnLoom: 40, lengthOffLoom: 37.2, lengthFinished: 33.48, ppiActual: 22 };
  old.yarns[0] = { ...old.yarns[0], brand: 'Maurice Brassard', colorName: 'Navy', dyeLot: 'A12', used: '1200 yd', leftover: '300 yd', cost: '$30' };
  old.finishing = { ...old.finishing, method: 'Machine washed', waterTemp: 'Warm', drying: 'Machine dried' };
  old.journal = [{ id: 'j1', date: '2026-10-01', kind: 'threaded', text: 'ok', photoIds: [] }];
  old.photos = [{ id: 'ph1', file: 'x.jpg', thumb: 'x-t.jpg', caption: '', cover: true }];
  old.hours = '12';
  const next = projectFrom(old, { id: 'pnew', now: Date.parse('2026-11-09T12:00:00Z') });
  assertEqual(next.id, 'pnew');
  assertEqual(next.status, 'planned');
  assertEqual(next.title, 'Blue towels (again)');
  assertEqual(next.basedOn, { id: 'pold', title: 'Blue towels' });
  const w = next.snapshot.warpPlan;
  assert(near(w.drawIn, 0.06) && near(w.shrinkWidth, 0.1) && near(w.takeUp, 0.07) && near(w.shrinkLength, 0.1), `measured factors: ${JSON.stringify(w)}`);
  assertEqual(w.ppi, 22);
  assertEqual(w.finishedWidth, plan.finishedWidth);
  assertEqual(next.snapshot.loom.name, 'Baby Wolf');
  assertEqual(next.snapshot.draft.meta.title, 'Twill towels');
  assertEqual(next.snapshot.ppi, 22);
  assertEqual([next.yarns[0].brand, next.yarns[0].colorName], ['Maurice Brassard', 'Navy']);
  assertEqual([next.yarns[0].dyeLot, next.yarns[0].used, next.yarns[0].leftover, next.yarns[0].cost], ['', '', '', '']);
  assert(next.yarns[0].id !== old.yarns[0].id, 'new row ids');
  assertEqual(next.finishing.method, 'Machine washed');
  assertEqual(next.tags, ['towels']);
  assertEqual([next.journal.length, next.photos.length, next.hours, next.completed], [0, 0, '', '']);
  assertEqual(next.measurements.ppiActual, null);
  assert(near(next.measurements.widthInReed, Math.round(next.snapshot.plan.widthInReed * 100) / 100), 'width in reed from the new plan');
  // Different draw-in and shrinkage make a different plan.
  assert(next.snapshot.plan.widthInReed !== old.snapshot.plan.widthInReed, 'plan worked out again');
});

test('projects: updating a planned project keeps what the weaver typed', () => {
  const p = newProject(snap(), { id: 'pupd' });
  p.yarns[0].brand = 'Halcyon';
  const wider = makeSnapshot({ draft: twillDraft(), warpPlan: { ...plan, finishedWidth: 24 }, loom });
  const u = updateSnapshot(p, wider);
  assertEqual(u.snapshot.warpPlan.finishedWidth, 24);
  assertEqual(u.yarns.find((y) => y.role === 'warp').brand, 'Halcyon');
  assertEqual(u.yarns.find((y) => y.role === 'warp').plannedYards, Math.ceil(wider.plan.warp.byColor[0].yards));
  assertEqual(u.measurements.widthInReed, Math.round(wider.plan.widthInReed * 100) / 100);
});

test('projects: older or partial projects are filled in', () => {
  const p = normalizeProject({ id: 'px', title: 'Old', status: 'bogus', measurements: { widthFinished: '17.5', lengthFinished: '' } });
  assertEqual(p.status, 'planned');
  assertEqual(p.measurements.widthFinished, 17.5);
  assertEqual(p.measurements.lengthFinished, null);
  assertEqual([p.yarns, p.journal, p.photos, p.tags], [[], [], [], []]);
  assertEqual(p.finishing.method, '');
});

// ---- the sheet ----

test('projects: the sheet escapes what the weaver typed and has every section', () => {
  const p = newProject(snap(), { id: 'psheet' });
  p.title = 'Towels <script>alert(1)</script>';
  p.notes = 'Use "fine" & soft\n\nSecond paragraph';
  p.lessons = 'Beat harder';
  p.measurements = { ...p.measurements, widthOnLoom: 18, widthFinished: 16 };
  p.yarns[0].brand = 'Brassard';
  p.finishing.method = 'Hand washed';
  p.hours = '10';
  p.journal = [{ id: 'j', date: '2026-10-02', kind: 'cut-off', text: 'Off <b>at last</b>', photoIds: ['ph1'] }];
  p.photos = [{ id: 'ph1', file: 'a.jpg', thumb: 'a-t.jpg', caption: 'On the loom', cover: false }, { id: 'ph2', file: 'b.jpg', thumb: 'b-t.jpg', caption: 'Done', cover: true }];
  const html = projectSheetHtml(p, { images: { drawdown: 'data:image/png;base64,AA', photos: { ph1: 'data:image/jpeg;base64,BB', ph2: 'data:image/jpeg;base64,CC' } } });
  assert(!html.includes('<script>') && html.includes('&lt;script&gt;'), 'title escaped');
  assert(!html.includes('<b>at last</b>'), 'journal text escaped');
  assert(html.includes('&quot;fine&quot; &amp; soft'), 'notes escaped');
  for (const part of ['The plan', 'Measurements', 'Yarns', 'Wet finishing', 'Time and cost', 'Journal', 'Notes', 'Lessons learned', 'Brassard', 'Cut off', 'Baby Wolf', 'Second paragraph']) {
    assert(html.includes(part), `has ${part}`);
  }
  assert(html.includes('base64,CC') && html.includes('base64,BB'), 'cover and journal photos');
  assert(!html.includes('<h2>Photos</h2>'), 'every photo already shown, so no separate gallery');
  const doc = sheetDocument(p.title, html);
  assert(doc.startsWith('<!doctype html>') && doc.includes('<style>'), 'standalone document');
});

test('projects: without photos the sheet says how many were left out', () => {
  const p = newProject(snap(), { id: 'pnophoto' });
  p.photos = [{ id: 'a', file: 'a', thumb: 'at' }, { id: 'b', file: 'b', thumb: 'bt' }];
  assert(projectSheetHtml(p).includes('2 photos not included'), 'note');
});

test('projects: the book has contents, a chapter each and a yarn index', () => {
  const a = newProject(snap(), { id: 'pa' });
  a.title = 'First';
  a.yarns[0].brand = 'Brassard';
  const b = newProject(snap(), { id: 'pb' });
  b.title = 'Second';
  b.yarns[0].brand = 'Brassard';
  const html = bookHtml([a, b], { title: 'Our <Weaving>' });
  assert(html.includes('Our &lt;Weaving&gt;'), 'title escaped');
  assert(html.includes('href="#project-pa"') && html.includes('id="project-pb"'), 'contents link to chapters');
  assert(html.includes('Chapter 1') && html.includes('Chapter 2'), 'chapters numbered');
  assert(/8\/2 cotton, Brassard <span class="sheet-muted">— chapters <a href="#project-pa">1<\/a>, <a href="#project-pb">2<\/a>/.test(html), 'yarn index');
});

// ---- storage ----

function freshStorage() {
  if (typeof window !== 'undefined') throw new Skip('Node only');
  const map = new Map();
  globalThis.localStorage = {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function fakeTeather() {
  let clock = Date.parse('2026-11-04T12:00:00Z');
  const folder = new Map();
  const fail = (status, code) => Object.assign(new Error(code), { status, code });
  const T = {
    signedIn: true,
    offline: false,
    folder,
    isSignedIn: () => T.signedIn,
    files: {
      async list() {
        if (T.offline) throw fail(undefined, 'offline');
        return [...folder].map(([name, f]) => ({ name, modifiedTime: f.modifiedTime }));
      },
      async get(name) {
        if (!folder.has(name)) throw fail(404, 'not_found');
        const { data } = folder.get(name);
        return { text: async () => String(data) };
      },
      async put(name, data, { ifUnmodifiedSince } = {}) {
        if (T.offline) throw fail(undefined, 'offline');
        const cur = folder.get(name);
        if (cur && ifUnmodifiedSince && Math.floor(Date.parse(cur.modifiedTime) / 1000) > Math.floor(Date.parse(ifUnmodifiedSince) / 1000)) throw fail(412, 'precondition_failed');
        const modifiedTime = new Date((clock += 2000)).toISOString();
        folder.set(name, { data, modifiedTime });
        return { name, modifiedTime };
      },
      async remove(name) {
        if (T.offline) throw fail(undefined, 'offline');
        if (!folder.delete(name)) throw fail(404, 'not_found');
      },
    },
  };
  return T;
}

test('projects: file names never clash with drafts', () => {
  const p = { id: 'p1a2b3c', title: 'Rosépath towels, #3!' };
  assertEqual(projectFileName(p), 'projects/project-Rosepath-towels-3-p1a2b3c.json');
  assertEqual(projectIdFromFileName('projects/project-Rosepath-towels-3-p1a2b3c.json'), 'p1a2b3c');
  assertEqual(projectIdFromFileName('projects/project-p1a2b3c.json'), 'p1a2b3c');
  assertEqual(projectIdFromFileName('draft-Rosepath-d1a2b3c.wif'), null);
  assertEqual(projectIdFromFileName(photoFileName('p1', 'x')), null);
  assertEqual(idFromFileName('projects/project-Rosepath-towels-3-p1a2b3c.json'), null);
  assertEqual(photoFileName('p1', 'x', true), 'projects/photos/p1-x-t.jpg');
});

test('projects: signed out they stay in this browser, then upload on sign-in', async () => {
  freshStorage();
  const T = fakeTeather();
  T.signedIn = false;
  const store = createMyProjects({ teather: () => T });
  const p = newProject(snap(), { id: 'pone' });
  assertEqual((await store.save(p)).where, 'browser');
  assertEqual(store.local().map((x) => x.id), ['pone']);
  assertEqual(T.folder.size, 0);
  T.signedIn = true;
  await store.list();
  assertEqual([...T.folder.keys()], ['projects/project-Twill-towels-pone.json']);
  // Renaming moves the file.
  store.put({ ...store.get('pone'), title: 'Blue towels' });
  assertEqual((await store.flush('pone')).where, 'drive');
  assertEqual([...T.folder.keys()], ['projects/project-Blue-towels-pone.json']);
});

test('projects: a project changed on another computer is kept as a copy', async () => {
  freshStorage();
  const T = fakeTeather();
  const store = createMyProjects({ teather: () => T });
  await store.save(newProject(snap(), { id: 'pconf' }));
  const name = 'projects/project-Twill-towels-pconf.json';
  // Another computer saves it later.
  const other = JSON.parse(T.folder.get(name).data);
  await T.files.put(name, JSON.stringify({ ...other, notes: 'from the other computer' }));
  store.put({ ...store.get('pconf'), notes: 'from here' });
  const r = await store.flush('pconf');
  assertEqual(r.where, 'copy');
  await store.list();
  const all = store.local();
  assertEqual(all.length, 2);
  assertEqual(store.get('pconf').notes, 'from the other computer');
  assertEqual(store.get(r.id).notes, 'from here');
});

test('projects: deleting a project removes its photos from Drive', async () => {
  freshStorage();
  const T = fakeTeather();
  const store = createMyProjects({ teather: () => T });
  const p = newProject(snap(), { id: 'pdel' });
  const ph = await store.uploadPhoto('pdel', { full: 'FULL', thumb: 'THUMB' }, { id: 'ph1' });
  p.photos.push(ph);
  await store.save(p);
  assertEqual(T.folder.size, 3);
  await store.remove('pdel');
  assertEqual(T.folder.size, 0);
  assertEqual(store.local().length, 0);
});

test('projects: deletions made offline happen on the next visit', async () => {
  freshStorage();
  const T = fakeTeather();
  const store = createMyProjects({ teather: () => T });
  const p = newProject(snap(), { id: 'poff' });
  p.photos.push(await store.uploadPhoto('poff', { full: 'F', thumb: 'T' }, { id: 'ph' }));
  await store.save(p);
  T.offline = true;
  await store.removePhoto('poff', p.photos[0]); // waits in the trash
  await store.remove('poff');
  assertEqual(store.local().length, 0, 'gone from the list at once');
  assertEqual(T.folder.size, 3, 'still in Drive while offline');
  T.offline = false;
  await store.list();
  assertEqual(T.folder.size, 0);
});

test('projects: photos need sign-in', async () => {
  freshStorage();
  const T = fakeTeather();
  T.signedIn = false;
  const store = createMyProjects({ teather: () => T });
  let err = null;
  try {
    await store.uploadPhoto('p', { full: 'F', thumb: 'T' });
  } catch (e) {
    err = e;
  }
  assert(err && /Sign in/.test(err.message), 'asks to sign in');
});
