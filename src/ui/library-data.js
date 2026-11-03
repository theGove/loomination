// Library data: loading the index shards and books, and filtering/sorting rows.
// No DOM here, so the filtering logic is testable in Node.
//
// Layout of library/ is described in library/README.md. Index shards are split
// by shaft count, so only the shards a weaver's loom can use are fetched.

export const FLAGS = {
  straightThreading: 1,
  straightTreadling: 2,
  pointThreading: 4,
  pointTreadling: 8,
  blockDraft: 16,
};

// Turn a shard's compact { fields, rows } into an array of plain objects.
export function decodeShard({ fields, rows }) {
  return rows.map((row) => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
}

// Path of a draft's WIF relative to library/: drafts/NN/<id>.wif, where NN is
// the last two digits of the id's number.
export function draftPath(id) {
  const digits = String(id).replace(/\D/g, '');
  return `drafts/${digits.slice(-2).padStart(2, '0')}/${id}.wif`;
}

// Shard keys ("02", "03", ...) needed to show drafts of at most maxShafts.
export function shardsFor(summary, maxShafts = Infinity) {
  return Object.keys(summary.shards)
    .filter((key) => Number(key) <= maxShafts)
    .sort((a, b) => Number(a) - Number(b));
}

export const DEFAULT_FILTER = {
  query: '',
  maxShafts: 0,       // 0 = any
  maxTreadles: 0,     // 0 = any
  book: 0,            // books.json id, 0 = any
  threading: '',      // '' | 'straight' | 'point'
  maxFloat: 0,        // longest float on the face, 0 = any
  sort: 'book',       // 'book' | 'shafts' | 'size'
};

// Rows matching a filter, sorted. books is a Map of id -> book (for search and sort).
export function filterDrafts(drafts, filter, books = new Map()) {
  const f = { ...DEFAULT_FILTER, ...filter };
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  const out = drafts.filter((d) => {
    if (f.maxShafts && d.shafts > f.maxShafts) return false;
    if (f.maxTreadles && d.treadles > f.maxTreadles) return false;
    if (f.book && d.book !== f.book) return false;
    if (f.threading === 'straight' && !(d.flags & FLAGS.straightThreading)) return false;
    if (f.threading === 'point' && !(d.flags & FLAGS.pointThreading)) return false;
    if (f.maxFloat && Math.max(d.warpFloat, d.weftFloat) > f.maxFloat) return false;
    if (words.length) {
      const book = books.get(d.book);
      const text = [d.id, d.title, d.names, book?.title, book?.authors].join(' ').toLowerCase();
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  });
  const year = (d) => books.get(d.book)?.year ?? 9999;
  const comparators = {
    // Oldest book first, then figures in natural order ("Figure 2" before "Figure 10").
    book: (a, b) => year(a) - year(b) || a.book - b.book || natural(a.title, b.title) || natural(a.id, b.id),
    shafts: (a, b) => a.shafts - b.shafts || a.treadles - b.treadles || natural(a.title, b.title),
    size: (a, b) => a.unitEnds * a.unitPicks - b.unitEnds * b.unitPicks || natural(a.title, b.title),
  };
  return out.sort(comparators[f.sort] ?? comparators.book);
}

const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });

// Read/write a filter as URL hash parameters, leaving out defaults.
export function filterToParams(filter) {
  const params = new URLSearchParams();
  for (const [key, def] of Object.entries(DEFAULT_FILTER)) {
    const v = filter[key];
    if (v !== undefined && v !== def && v !== '') params.set(key, String(v));
  }
  return params;
}

export function filterFromParams(params) {
  const f = { ...DEFAULT_FILTER };
  for (const [key, def] of Object.entries(DEFAULT_FILTER)) {
    if (!params.has(key)) continue;
    const raw = params.get(key);
    if (typeof def === 'number') {
      const n = parseInt(raw, 10);
      f[key] = Number.isFinite(n) && n >= 0 ? n : def;
    } else {
      f[key] = raw;
    }
  }
  return f;
}

// Fetch the library. base is the URL of the library/ folder (ending in '/').
// Shards are fetched on demand and cached.
export function createLibrary(base, fetchImpl = (url) => fetch(url)) {
  const json = async (path) => {
    const res = await fetchImpl(new URL(path, base));
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  };
  const shardCache = new Map();
  let summaryPromise = null;
  let booksPromise = null;

  return {
    summary: () => (summaryPromise ??= json('index/summary.json')),
    books: () => (booksPromise ??= json('books.json').then((list) => new Map(list.map((b) => [b.id, b])))),
    async drafts(maxShafts = Infinity) {
      const keys = shardsFor(await this.summary(), maxShafts);
      const shards = await Promise.all(keys.map((key) => {
        if (!shardCache.has(key)) shardCache.set(key, json(`index/shafts-${key}.json`).then(decodeShard));
        return shardCache.get(key);
      }));
      return shards.flat();
    },
    wifUrl: (id) => new URL(draftPath(id), base).href,
    async wifText(id) {
      const res = await fetchImpl(new URL(draftPath(id), base));
      if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
      return res.text();
    },
  };
}
