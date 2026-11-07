// Builds the map data in public/data from Natural Earth (public domain).
// Usage: npm run build:data
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const cache = '.cache/ne';
const out = 'public/data';
mkdirSync(cache, { recursive: true });

async function get(name) {
  const file = join(cache, `${name}.geojson`);
  if (!existsSync(file)) {
    console.log('download', name);
    const res = await fetch(NE + name + '.geojson');
    if (!res.ok) throw new Error(`${res.status} ${name}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return file;
}

const ms = (args) => execFileSync('npx', ['mapshaper', ...args], { stdio: 'inherit' });

const countries = await get('ne_50m_admin_0_countries');
const states = await get('ne_10m_admin_1_states_provinces');

mkdirSync(out, { recursive: true });
ms([
  countries,
  '-filter', 'ISO_A2_EH != "-99" && ISO_A2_EH != "AQ"',
  '-each', 'id=ISO_A2_EH, name=NAME, name_ja=NAME_JA, lx=LABEL_X, ly=LABEL_Y',
  '-filter-fields', 'id,name,name_ja,lx,ly',
  '-simplify', '20%', 'keep-shapes',
  '-rename-layers', 'countries',
  '-o', join(out, 'world.json'), 'format=topojson', 'quantization=1e5', 'id-field=id',
]);

const dir = join(out, 'admin1');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
ms([
  states,
  '-each', 'cc = (iso_a2 && iso_a2.length === 2) ? iso_a2 : (iso_3166_2 || "").slice(0, 2)',
  '-filter', 'cc.length === 2 && /^[A-Z]{2}$/.test(cc)',
  '-each', 'code=iso_3166_2, ja=name_ja',
  '-filter-fields', 'cc,code,name,ja',
  '-simplify', '6%', 'keep-shapes', 'planar',
  '-split', 'cc',
  '-o', dir + '/', 'format=geojson', 'precision=0.001',
]);

// Rename split files to <CC>.json and write an index of available countries.
const index = [];
for (const f of readdirSync(dir)) {
  const m = f.match(/([A-Z]{2})\.json$/);
  if (!m) continue;
  const target = join(dir, `${m[1]}.json`);
  if (f !== `${m[1]}.json`) {
    writeFileSync(target, readFileSync(join(dir, f)));
    rmSync(join(dir, f));
  }
  index.push(m[1]);
}
writeFileSync(join(out, 'admin1-index.json'), JSON.stringify(index.sort()));
console.log('admin1 countries:', index.length);
