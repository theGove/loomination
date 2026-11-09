// A woven project: a snapshot of the plan it was woven from (draft, warp plan,
// loom) and what really happened — measurements at each stage, yarns, wet
// finishing, a journal and photos. Plain JSON; storage is in ui/my-projects.js.
//
// The measurements give the real draw-in, take-up and shrinkage, in the same
// form the warp plan uses (core/warp-calc.js), so the next plan can use them:
//   width in reed × (1 − drawIn) = width on the loom
//   width on the loom × (1 − shrinkWidth) = finished width
//   length woven (under tension) × (1 − takeUp) = length off the loom (relaxed)
//   length off the loom × (1 − shrinkLength) = finished length

import { normalizeDraft } from './draft.js';
import { withWarpDefaults, resolveWarpPlan, yarnName, SHRINK_FIELDS, MAX_FACTOR } from './warp-plan.js';

export const PROJECT_VERSION = 1;

export const STATUSES = [
  ['planned', 'Planned'],
  ['on-loom', 'On the loom'],
  ['off-loom', 'Off the loom'],
  ['finished', 'Finished'],
  ['given', 'Given or sold'],
];
export const statusName = (id) => STATUSES.find(([k]) => k === id)?.[1] ?? 'Planned';

// Journal entries; a stage moves the project's status forward (never back).
export const JOURNAL_KINDS = [
  ['note', 'Note', null],
  ['wound', 'Warp wound', 'on-loom'],
  ['beamed', 'Beamed', 'on-loom'],
  ['threaded', 'Threaded', 'on-loom'],
  ['sleyed', 'Sleyed', 'on-loom'],
  ['tied-on', 'Tied on', 'on-loom'],
  ['started', 'Started weaving', 'on-loom'],
  ['problem', 'Problem or fix', null],
  ['cut-off', 'Cut off', 'off-loom'],
  ['wet-finished', 'Wet finished', 'off-loom'],
  ['hemmed', 'Hemmed or fringed', 'off-loom'],
  ['finished', 'Finished', 'finished'],
  ['given', 'Given or sold', 'given'],
];
export const kindName = (id) => JOURNAL_KINDS.find(([k]) => k === id)?.[1] ?? 'Note';

export const FINISHING_METHODS = ['', 'Hand washed', 'Machine washed', 'Soaked only', 'Fulled', 'Steamed', 'Not washed'];
export const WATER_TEMPS = ['', 'Cold', 'Cool', 'Warm', 'Hot'];
export const DRYING = ['', 'Line dried', 'Dried flat', 'Machine dried', 'Rolled in a towel', 'Pressed damp'];

export const MEASUREMENT_FIELDS = ['widthInReed', 'widthOnLoom', 'lengthWovenOnLoom', 'ppiActual', 'widthOffLoom', 'lengthOffLoom', 'widthFinished', 'lengthFinished'];

export const newProjectId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
export const newItemId = () => Math.random().toString(36).slice(2, 9);

const hex = (rgb = [0, 0, 0]) => `#${rgb.map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('')}`;
const round = (n, places = 2) => Math.round(n * 10 ** places) / 10 ** places;
const today = (now) => new Date(now).toISOString().slice(0, 10);

/**
 * The plan as it stands: draft, warp inputs, loom. The warp plan is worked out
 * here (resolveWarpPlan), so the snapshot carries the numbers the weaver saw.
 */
export function makeSnapshot({ draft, warpPlan, loom, now = Date.now() }) {
  const inputs = withWarpDefaults(warpPlan);
  delete inputs.onHand; // a shopping list, not part of the project
  const r = resolveWarpPlan(draft, inputs);
  return {
    draft: structuredClone(draft),
    warpPlan: inputs,
    epi: r.epi,
    ppi: r.ppi,
    warpYarnName: yarnName(inputs.warpYarn, r.warpYpp),
    weftYarnName: yarnName(inputs.weftYarn, r.weftYpp, inputs.warpYarn),
    warpYpp: r.warpYpp,
    weftYpp: r.weftYpp,
    plan: r.plan,
    loom: loom ? structuredClone(loom) : null,
    takenAt: now,
  };
}

// One row per yarn color the plan uses, ready for brands, dye lots and amounts.
function yarnRows(snapshot) {
  const { draft, plan } = snapshot;
  const rows = [];
  const add = (role, name, list) => {
    for (const c of list) {
      rows.push({
        id: newItemId(), role, name, yarnId: role === 'warp' ? snapshot.warpPlan.warpYarn : snapshot.warpPlan.weftYarn,
        colorHex: hex(draft.palette[c.color]), colorName: '', brand: '', dyeLot: '',
        plannedYards: Math.ceil(c.yards), used: '', leftover: '', cost: '',
      });
    }
  };
  if (plan) {
    add('warp', snapshot.warpYarnName, plan.warp.byColor);
    add('weft', snapshot.weftYarnName, plan.weft.byColor);
  }
  return rows;
}

/** A new project from a snapshot (see makeSnapshot). */
export function newProject(snapshot, { id = newProjectId(), now = Date.now(), title, draftId = null } = {}) {
  return normalizeProject({
    id,
    title: title ?? (snapshot.draft.meta?.title || 'Untitled project'),
    status: 'planned',
    created: now,
    updated: now,
    started: today(now),
    tags: [],
    draftId,
    snapshot,
    measurements: { widthInReed: snapshot.plan ? round(snapshot.plan.widthInReed) : null },
    yarns: yarnRows(snapshot),
  });
}

/** Fill in anything missing, so older or partial projects are safe to show. */
export function normalizeProject(p) {
  const out = {
    version: PROJECT_VERSION,
    id: p.id,
    title: p.title ?? '',
    status: STATUSES.some(([k]) => k === p.status) ? p.status : 'planned',
    created: p.created ?? Date.now(),
    updated: p.updated ?? p.created ?? Date.now(),
    started: p.started ?? '',
    completed: p.completed ?? '',
    tags: Array.isArray(p.tags) ? p.tags : [],
    draftId: p.draftId ?? null,
    basedOn: p.basedOn ?? null,
    snapshot: p.snapshot ?? null,
    measurements: Object.fromEntries(MEASUREMENT_FIELDS.map((k) => [k, num(p.measurements?.[k])])),
    yarns: Array.isArray(p.yarns) ? p.yarns : [],
    finishing: { method: '', waterTemp: '', agitation: '', minutes: '', drying: '', pressing: '', edges: '', notes: '', ...p.finishing },
    journal: Array.isArray(p.journal) ? p.journal : [],
    photos: Array.isArray(p.photos) ? p.photos : [],
    hours: p.hours ?? '',
    cost: p.cost ?? '',
    recipient: p.recipient ?? '',
    notes: p.notes ?? '',
    lessons: p.lessons ?? '',
  };
  if (out.snapshot?.draft) out.snapshot = { ...out.snapshot, draft: normalizeDraft(out.snapshot.draft) };
  return out;
}

function num(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const loss = (after, before) => (after > 0 && before > 0 ? 1 - after / before : null);

/**
 * Draw-in, take-up and shrinkage from the measurements (fractions; null where
 * a measurement is missing). Also the parts the planner lumps together (width
 * lost coming off the loom vs. in the wash) and the overall loss from reed to
 * finished cloth, which needs only the first and last measurements.
 */
export function measuredFactors(m = {}) {
  const v = (k) => num(m[k]);
  return {
    drawIn: loss(v('widthOnLoom'), v('widthInReed')),
    shrinkWidth: loss(v('widthFinished'), v('widthOnLoom')),
    takeUp: loss(v('lengthOffLoom'), v('lengthWovenOnLoom')),
    shrinkLength: loss(v('lengthFinished'), v('lengthOffLoom')),
    widthOffLoom: loss(v('widthOffLoom'), v('widthOnLoom')),
    widthInWash: loss(v('widthFinished'), v('widthOffLoom')),
    widthOverall: loss(v('widthFinished'), v('widthInReed')),
    lengthOverall: loss(v('lengthFinished'), v('lengthWovenOnLoom')),
  };
}

/**
 * The measured factors the warp plan can take, rounded to a tenth of a percent
 * and kept within what the plan accepts (cloth that grew counts as 0).
 */
export function factorsForPlan(m) {
  const f = measuredFactors(m);
  const out = {};
  for (const k of SHRINK_FIELDS) {
    if (f[k] == null) continue;
    out[k] = Math.min(MAX_FACTOR, Math.max(0, round(f[k], 3)));
  }
  return out;
}

/** Planned vs measured, one row per factor, for the project page and sheet. */
export function comparison(project) {
  const planned = withWarpDefaults(project.snapshot?.warpPlan);
  const f = measuredFactors(project.measurements);
  const rows = [
    ['drawIn', 'Draw-in on the loom'],
    ['shrinkWidth', 'Width loss, loom to finished'],
    ['takeUp', 'Warp take-up (relaxing off the loom)'],
    ['shrinkLength', 'Length shrinkage in finishing'],
  ].map(([k, label]) => ({ key: k, label, planned: planned[k], measured: f[k] }));
  const m = project.measurements;
  const sizes = [
    { key: 'width', label: 'Finished width', planned: planned.finishedWidth, measured: m.widthFinished },
    { key: 'length', label: 'Finished length (per piece)', planned: planned.finishedLength, measured: m.lengthFinished },
  ];
  return { rows, sizes, factors: f };
}

/** Status after a journal entry of this kind: moved forward, never back. */
export function statusAfter(status, kind) {
  const to = JOURNAL_KINDS.find(([k]) => k === kind)?.[2];
  if (!to) return status;
  const order = STATUSES.map(([k]) => k);
  return order.indexOf(to) > order.indexOf(status) ? to : status;
}

/**
 * A new project to weave again: the same draft, loom, yarns and finishing,
 * with the warp plan's draw-in, take-up and shrinkage (and picks per inch)
 * replaced by what this project measured. Measurements, journal, photos,
 * amounts used, hours and cost start empty.
 */
export function projectFrom(project, { id = newProjectId(), now = Date.now() } = {}) {
  const src = normalizeProject(project);
  const warpPlan = { ...withWarpDefaults(src.snapshot?.warpPlan), ...factorsForPlan(src.measurements) };
  if (src.measurements.ppiActual > 0) warpPlan.ppi = src.measurements.ppiActual;
  const snapshot = makeSnapshot({ draft: src.snapshot.draft, warpPlan, loom: src.snapshot.loom, now });
  const next = newProject(snapshot, { id, now, title: `${src.title || 'Untitled project'} (again)`, draftId: src.draftId });
  // Keep the yarn choices, not what was used or left over.
  const fresh = new Map(next.yarns.map((y) => [`${y.role}${y.colorHex}`, y]));
  next.yarns = src.yarns.map((y) => ({
    ...y,
    id: newItemId(),
    plannedYards: fresh.get(`${y.role}${y.colorHex}`)?.plannedYards ?? y.plannedYards ?? '',
    used: '', leftover: '', dyeLot: '', cost: '',
  }));
  for (const y of fresh.values()) {
    if (!next.yarns.some((r) => r.role === y.role && r.colorHex === y.colorHex)) next.yarns.push(y);
  }
  next.finishing = { ...src.finishing };
  next.tags = [...src.tags];
  next.basedOn = { id: src.id, title: src.title };
  return next;
}

/**
 * Replace a planned project's snapshot (the weaver changed the plan before
 * warping). Planned yardage follows the new plan; anything the weaver typed
 * about the yarns is kept.
 */
export function updateSnapshot(project, snapshot) {
  const p = normalizeProject(project);
  const oldReed = p.snapshot?.plan ? round(p.snapshot.plan.widthInReed) : null;
  p.snapshot = snapshot;
  if (snapshot.plan && (p.measurements.widthInReed == null || p.measurements.widthInReed === oldReed)) {
    p.measurements.widthInReed = round(snapshot.plan.widthInReed);
  }
  const fresh = yarnRows(snapshot);
  const typed = (y) => ['brand', 'colorName', 'dyeLot', 'used', 'leftover', 'cost'].some((k) => y[k] !== '' && y[k] != null);
  const kept = p.yarns.filter((y) => typed(y) || y.role === 'other');
  for (const y of kept) {
    const f = fresh.find((r) => r.role === y.role && r.colorHex === y.colorHex);
    if (f) y.plannedYards = f.plannedYards;
  }
  p.yarns = [...kept, ...fresh.filter((f) => !kept.some((y) => y.role === f.role && y.colorHex === f.colorHex))];
  if (!p.title || p.title === project.snapshot?.draft?.meta?.title) p.title = snapshot.draft.meta?.title || p.title;
  return p;
}

/** The cover photo: the one marked, else the first. */
export const coverPhoto = (p) => p.photos.find((ph) => ph.cover) ?? p.photos[0] ?? null;
