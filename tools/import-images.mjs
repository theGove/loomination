// Batch image -> WIF conversion using the same pipeline as the in-browser
// importer.
//
//   node tools/import-images.mjs jobs.jsonl > results.jsonl
//
// Each input line is a job:
//   { "id": "...", "png": "path.png", "wif": "out.wif",
//     "expectedEnds": 32, "expectedPicks": 32,        // optional
//     "meta": { "title": "...", "source": "...", ... } } // optional, see draft.meta
//
// Each output line reports one job:
//   { "id", "ok", "error"?, "report"?, "forcedGrid"? }
// A WIF is written only when the derived draft reproduces the image exactly,
// matches the expected counts, and the grid didn't have to be spread evenly.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { decodePng } from './png.js';
import { importFromImage } from '../src/importImage/index.js';
import { toWif } from '../src/core/wif.js';

const [jobsPath] = process.argv.slice(2);
if (!jobsPath) {
  console.error('usage: node tools/import-images.mjs jobs.jsonl > results.jsonl');
  process.exit(2);
}

const lines = (await readFile(jobsPath, 'utf8')).split(/\r?\n/).filter((l) => l.trim());
for (const line of lines) {
  const job = JSON.parse(line);
  console.log(JSON.stringify(await runJob(job)));
}

async function runJob(job) {
  try {
    const img = await decodePng(await readFile(job.png));
    const { draft, report, grid } = importFromImage(img, {
      expectedEnds: job.expectedEnds,
      expectedPicks: job.expectedPicks,
    });
    const countsOk = (!job.expectedEnds || report.ends === job.expectedEnds)
      && (!job.expectedPicks || report.picks === job.expectedPicks);
    // A grid spread evenly to hit the expected counts can be misaligned and
    // still "match" (it is compared with its own samples), so don't trust it.
    const ok = countsOk && report.mismatches === 0 && report.exactColors && grid.forced !== 'spread';
    if (ok && job.wif) {
      Object.assign(draft.meta, job.meta ?? {});
      await mkdir(dirname(job.wif), { recursive: true });
      await writeFile(job.wif, toWif(draft));
    }
    return { id: job.id, ok, report, forcedGrid: grid.forced };
  } catch (err) {
    return { id: job.id, ok: false, error: String(err?.message ?? err) };
  }
}
