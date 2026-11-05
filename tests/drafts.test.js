import { test, assert, assertEqual, Skip } from './harness.js';
import { createDraft } from '../src/core/draft.js';
import { toWif } from '../src/core/wif.js';
import { createMyDrafts, fileNameFor, idFromFileName } from '../src/ui/my-drafts.js';
import * as saved from '../src/ui/saved-drafts.js';
import * as sync from '../src/ui/sync.js';

// Uses a stand-in for localStorage, so it runs under Node only (in a browser it
// would change the drafts saved on this site).
function freshStorage(items = {}) {
  if (typeof window !== 'undefined') throw new Skip('Node only');
  const map = new Map(Object.entries(items));
  globalThis.localStorage = {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

// Teather's files API over an in-memory Drive folder.
function fakeTeather() {
  let clock = Date.parse('2026-11-04T12:00:00Z');
  const folder = new Map(); // name -> { text, modifiedTime }
  const fail = (status, code) => Object.assign(new Error(code), { status, code });
  const T = {
    signedIn: true,
    offline: false,
    folder,
    isSignedIn: () => T.signedIn,
    tick: () => new Date((clock += 2000)).toISOString(),
    files: {
      async list() {
        if (T.offline) throw fail(undefined, 'offline');
        return [...folder].map(([name, f]) => ({ name, modifiedTime: f.modifiedTime }));
      },
      async get(name) {
        if (T.offline) throw fail(undefined, 'offline');
        if (!folder.has(name)) throw fail(404, 'not_found');
        const { text } = folder.get(name);
        return { text: async () => text };
      },
      async put(name, text, { ifUnmodifiedSince } = {}) {
        if (T.offline) throw fail(undefined, 'offline');
        const cur = folder.get(name);
        if (cur && ifUnmodifiedSince && Math.floor(Date.parse(cur.modifiedTime) / 1000) > Math.floor(Date.parse(ifUnmodifiedSince) / 1000)) {
          throw fail(412, 'precondition_failed');
        }
        const modifiedTime = T.tick();
        folder.set(name, { text, modifiedTime });
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

const titled = (title, shafts = 4) => {
  const d = createDraft({ shafts, treadles: 4, numEnds: 8, numPicks: 8 });
  return { ...d, meta: { ...d.meta, title } };
};

test('drafts: file names carry the title and id, and are recognized', () => {
  assertEqual(fileNameFor(titled('Rosépath towels, #3!'), 'd1a2b3c'), 'draft-Rosepath-towels-3-d1a2b3c.wif');
  assertEqual(fileNameFor(titled(''), 'd1a2b3c'), 'draft-d1a2b3c.wif');
  const long = fileNameFor(titled('x'.repeat(120)), 'dabc');
  assert(long.length <= 100 && /^[A-Za-z0-9._-]+$/.test(long), `fits Teather's rules: ${long}`);
  assertEqual(idFromFileName('draft-Rosepath-towels-3-d1a2b3c.wif'), 'd1a2b3c');
  assertEqual(idFromFileName('draft-d1a2b3c.wif'), 'd1a2b3c');
  assertEqual([idFromFileName('state.json'), idFromFileName('README.md'), idFromFileName('notes-d1.txt')], [null, null, null]);
});

test('drafts: signed out they stay in this browser, then upload on sign-in', async () => {
  freshStorage();
  const T = fakeTeather();
  T.signedIn = false;
  const my = createMyDrafts({ teather: () => T });
  const { id, where } = await my.save(titled('Towels'));
  assertEqual(where, 'browser');
  assertEqual((await my.list()).map((d) => [d.title, d.pending]), [['Towels', true]]);
  assertEqual(T.folder.size, 0);
  T.signedIn = true;
  const list = await my.list();
  assertEqual([...T.folder.keys()], [`draft-Towels-${id}.wif`]);
  assertEqual(list.map((d) => [d.title, d.pending]), [['Towels', false]]);
});

test('drafts: save, rename and delete in Drive', async () => {
  freshStorage();
  const T = fakeTeather();
  const my = createMyDrafts({ teather: () => T });
  const { id, where } = await my.save(titled('Towels'));
  assertEqual(where, 'drive');
  await my.save(titled('Kitchen towels'), id);
  assertEqual([...T.folder.keys()], [`draft-Kitchen-towels-${id}.wif`], 'renaming replaces the file');
  await my.remove(id);
  assertEqual(T.folder.size, 0);
  assertEqual(await my.list(), []);
});

test('drafts: files from another computer appear, deleted ones go', async () => {
  freshStorage();
  const T = fakeTeather();
  const my = createMyDrafts({ teather: () => T });
  T.folder.set('draft-Scarf-dother1.wif', { text: toWif(titled('Scarf', 8)), modifiedTime: T.tick() });
  T.folder.set('notes.txt', { text: 'not a draft', modifiedTime: T.tick() });
  let list = await my.list();
  assertEqual(list.map((d) => [d.id, d.title, d.draft.shafts]), [['dother1', 'Scarf', 8]]);
  T.folder.delete('draft-Scarf-dother1.wif');
  list = await my.list();
  assertEqual(list, []);
});

test('drafts: a file changed on another computer is kept, and this version saved as a copy', async () => {
  freshStorage();
  const T = fakeTeather();
  const my = createMyDrafts({ teather: () => T });
  const { id } = await my.save(titled('Towels'));
  const name = `draft-Towels-${id}.wif`;
  T.folder.set(name, { text: toWif(titled('Towels', 6)), modifiedTime: T.tick() }); // another computer
  const r = await my.save(titled('Towels', 8), id);
  assertEqual(r.where, 'copy');
  assert(r.id !== id, 'copy has its own id');
  const list = await my.list();
  assertEqual(list.map((d) => d.draft.shafts).sort(), [6, 8], 'both versions kept');
});

test('drafts: offline saves and deletions happen on the next visit', async () => {
  freshStorage();
  const T = fakeTeather();
  const my = createMyDrafts({ teather: () => T });
  await my.save(titled('Keep'));
  const gone = await my.save(titled('Gone'));
  T.offline = true;
  assertEqual((await my.save(titled('New'))).where, 'browser');
  await my.remove(gone.id);
  assertEqual((await my.list()).map((d) => d.title).sort(), ['Keep', 'New'], 'list falls back to this browser');
  T.offline = false;
  await my.list();
  assertEqual([...T.folder.keys()].map((n) => n.replace(/-d[a-z0-9]+\.wif$/, '')).sort(), ['draft-Keep', 'draft-New']);
});

test('drafts: old state.json drafts move to files, and leave state.json only once uploaded', async () => {
  const old = { id: 'dold1', title: 'Old one', saved: 5, draft: titled('Old one') };
  freshStorage({ 'teather:i:draft:dold1': JSON.stringify({ value: old, updatedAt: 5 }) });
  const T = fakeTeather();
  T.signedIn = false;
  const my = createMyDrafts({ teather: () => T });
  assertEqual((await my.list()).map((d) => [d.id, d.pending]), [['dold1', true]]);
  assert(sync.get('draft:dold1'), 'kept in state.json until uploaded');
  T.signedIn = true;
  await my.list();
  assertEqual([...T.folder.keys()], ['draft-Old-one-dold1.wif']);
  assertEqual(sync.get('draft:dold1'), undefined, 'removed from state.json');
  assertEqual((await my.list()).length, 1, 'not adopted twice');
});

// --- The working draft -------------------------------------------------------

test('working draft: none until one is chosen', async () => {
  freshStorage();
  assertEqual(saved.loadCurrent(), null);
  assertEqual(await saved.chooseDraft(titled('First')), null, 'nothing to keep');
  assertEqual(saved.loadCurrent().meta.title, 'First');
});

test('working draft: choosing another keeps unsaved changes in My drafts', async () => {
  freshStorage();
  await saved.chooseDraft(titled('Edited'));
  saved.saveCurrentSoon(titled('Edited', 6));
  saved.setDirty(true);
  assertEqual(await saved.chooseDraft(titled('Next')), 'Edited');
  assertEqual(saved.loadCurrent().meta.title, 'Next');
  assert(!saved.isDirty(), 'the new draft starts clean');
  const kept = saved.localDrafts();
  assertEqual(kept.map((d) => [d.title, d.draft.shafts]), [['Edited', 6]], 'the latest edit was kept, not the autosave before it');
});

test('working draft: a draft without changes is not saved again', async () => {
  freshStorage();
  await saved.chooseDraft(titled('Untouched'));
  assertEqual(await saved.chooseDraft(titled('Other')), null);
  assertEqual(saved.localDrafts().length, 0);
});

test('working draft: changes to a My drafts entry update that entry', async () => {
  freshStorage();
  const { id } = await saved.saveDraft(titled('Mine'));
  await saved.chooseDraft(titled('Mine'), id);
  saved.saveCurrentSoon(titled('Mine', 8));
  saved.setDirty(true);
  await saved.chooseDraft(titled('Library one'));
  assertEqual(saved.localDrafts().map((d) => [d.id, d.draft.shafts]), [[id, 8]]);
  assertEqual(saved.loadCurrentId(), null, 'the new draft is not a My drafts entry');
});
