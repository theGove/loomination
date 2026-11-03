// How much yarn is left on a cone or tube, from its weight.
//
// The core's weight is estimated from its shape as a thin shell (surface area
// times wall thickness times density), or taken as given if the weaver has
// weighed an empty one. The rest is yarn, converted with yards per pound.
// Lengths are in centimetres and weights in grams.

export const GRAMS_PER_POUND = 453.592;

// Densities in g/cm³: [typical, low, high]. Paper cones and tubes are dense
// wound paperboard; plastic ones are polypropylene or similar.
export const CORE_MATERIALS = {
  cardboard: { name: 'Cardboard (paper)', density: [0.75, 0.6, 0.95] },
  plastic: { name: 'Plastic', density: [0.95, 0.9, 1.05] },
};

// Yardage printed on cones varies a little between dye lots and makers.
const YPP_SPREAD = 0.05;

// Wall area of the core in cm².
//   tube: a cylinder of one diameter
//   cone: a frustum from baseDiameter to topDiameter
export function coreArea({ shape, length, baseDiameter, topDiameter = baseDiameter }) {
  const R = baseDiameter / 2;
  if (shape === 'tube') return Math.PI * baseDiameter * length;
  const r = Math.min(topDiameter, baseDiameter) / 2;
  const slant = Math.hypot(length, R - r);
  return Math.PI * (R + r) * slant;
}

// Estimated core weight: { grams, low, high }.
export function coreWeight({ shape, length, baseDiameter, topDiameter, thickness, material }) {
  const volume = coreArea({ shape, length, baseDiameter, topDiameter }) * thickness;
  const [typical, low, high] = (CORE_MATERIALS[material] ?? CORE_MATERIALS.cardboard).density;
  return { grams: volume * typical, low: volume * low, high: volume * high };
}

// Yarn on the core: { netGrams, yards, meters, low, high } (low/high in yards).
// core is { grams, low, high } from coreWeight, or a weighed core as { grams }.
export function yarnOnCore({ grossGrams, core, ypp }) {
  const coreLow = core.low ?? core.grams;
  const coreHigh = core.high ?? core.grams;
  const netGrams = Math.max(0, grossGrams - core.grams);
  const yardsFor = (grams, perPound) => (Math.max(0, grams) / GRAMS_PER_POUND) * perPound;
  const yards = yardsFor(netGrams, ypp);
  return {
    netGrams,
    yards,
    meters: yards * 0.9144,
    low: yardsFor(grossGrams - coreHigh, ypp * (1 - YPP_SPREAD)),
    high: yardsFor(grossGrams - coreLow, ypp * (1 + YPP_SPREAD)),
  };
}
