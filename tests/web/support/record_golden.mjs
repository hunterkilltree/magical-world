import { writeFileSync } from 'node:fs';
import { runScenario, SCENARIOS } from './scenario.mjs';
const out = SCENARIOS.map(([w, r, seed]) => ({ wizard: w, role: r, seed, ...runScenario(w, r, seed) }));
writeFileSync(new URL('../golden/single_player.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(out.map((o) => `${o.wizard} ${o.digest.slice(0, 10)} wave ${o.final.wave} kills ${o.final.kills} mode ${o.final.mode} casts ${o.final.casts}`).join('\n'));
