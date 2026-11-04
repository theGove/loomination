import { test, assert, assertEqual, Skip } from './harness.js';
import { listLooms, loadLoom, saveLoom, chooseLoom, deleteLoom, unusedName, DEFAULT_LOOM } from '../src/ui/loom-profile.js';

// Uses a stand-in for localStorage, so it runs under Node only (in a browser it
// would change the looms saved on this site).
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

test('looms: a default until one is saved', () => {
  freshStorage();
  assertEqual(listLooms(), []);
  const loom = loadLoom();
  assertEqual(loom.id, '');
  assertEqual(loom.name, 'My loom');
});

test('looms: the single loom from older versions becomes the first named loom', () => {
  freshStorage({ 'teather:i:loom': JSON.stringify({ value: { type: 'table', shafts: 8 }, updatedAt: 1 }) });
  const looms = listLooms();
  assertEqual(looms.length, 1);
  assertEqual([looms[0].id, looms[0].name, looms[0].type, looms[0].shafts], ['main', 'My loom', 'table', 8]);
  assertEqual(listLooms().length, 1, 'migrates once');
});

test('looms: save, choose, delete', () => {
  freshStorage();
  const a = saveLoom({ ...DEFAULT_LOOM, name: 'Baby Wolf' });
  const b = saveLoom({ ...DEFAULT_LOOM, name: 'Ashford table', type: 'table', shafts: 8 });
  assert(a.id && b.id && a.id !== b.id, 'new looms get ids');
  assertEqual(listLooms().map((l) => l.name), ['Ashford table', 'Baby Wolf']);
  chooseLoom(a.id);
  assertEqual(loadLoom().name, 'Baby Wolf');
  chooseLoom(b.id);
  assertEqual(loadLoom().shafts, 8);
  deleteLoom(b.id);
  assertEqual(loadLoom().name, 'Baby Wolf', 'falls back to another loom');
  assertEqual(unusedName(listLooms()), 'Loom 2');
});
