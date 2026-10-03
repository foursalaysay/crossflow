import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import type { Trace } from '../lib/service';
import { evidenceBundle } from '../lib/evidence';
const dir = 'artifacts/submission';
mkdirSync(dir, { recursive: true });
const observed = evidenceBundle();
writeFileSync(`${dir}/paper-evidence.json`, JSON.stringify(observed, null, 2));
const fixture = JSON.parse(readFileSync(`${dir}/fixture-flow.json`, 'utf8'));
const esc = (s: unknown) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const details = (d: Trace) =>
  `<details><summary>${esc(d.agent.decision.decision)} · ${esc(d.risk.status)} · ${d.execution ? 'SIMULATED FILL' : 'NO ORDER'}</summary><pre>${esc(JSON.stringify({ id: d.id, timestamp: new Date(d.timestamp).toISOString(), mode: d.mode, events: d.context.events, agent: d.agent, risk: d.risk, revalidation: d.revalidation, executionRecorded: !!d.execution }, null, 2))}</pre><small>Full evidence and fill details are in the downloadable JSON.</small></details>`;
writeFileSync(
  `${dir}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CrossFlow — Agentic Trading evidence</title><style>body{background:#0d1511;color:#dce6da;font:16px system-ui;max-width:1000px;margin:40px auto;padding:24px}h1{color:#b7ea73}section,details{border:1px solid #354c36;border-radius:10px;padding:20px;margin:16px 0}a{color:#b7ea73}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}summary{cursor:pointer}button{padding:12px;background:#b7ea73;border:0;border-radius:6px}small{color:#94a68f}</style><h1>CrossFlow</h1><p>LLM decisions → independent risk checks → automatic paper execution.</p><small>Evidence package generated ${esc(observed.generatedAt)}. This portable viewer does not connect to accounts or trade.</small><section><h2>Observed paper ledger</h2><p>${observed.summary.decisions} decisions · ${observed.summary.trades} trades · ${observed.summary.successfulModelDecisions} valid model decisions · ${observed.summary.competitionPeriodDecisions} competition-period decisions.</p><p>These are real application logs. WAIT and failure records are included. Zero executed trades is not proof of profitability.</p><a href="paper-evidence.json" download>Download observed evidence</a>${observed.decisions.map(details).join('')}</section><section><h2>Execution demonstration — synthetic fixture</h2><p>Mocked prices and model outputs exercise the actual risk and paper engine. This is software verification, not Qwen performance or competition trading history.</p><button id="step">Show next execution step</button><div id="flow">${fixture.decisions
    .slice()
    .reverse()
    .map((d: Parameters<typeof details>[0]) => '<div hidden class="step">' + details(d) + '</div>')
    .join(
      '',
    )}</div><p><a href="fixture-flow.json" download>Download fixture evidence</a></p></section><section><h2>Full application functions</h2><a href="website-functions.md">Read the function guide</a><p>The live app includes market charts, a stock/crypto watchlist, agent controls, macro context, journals, metrics and manually confirmed Bitget tickets. Source and persistent Node hosting are needed to run it.</p></section><script>document.getElementById('step').onclick=function(){const s=document.querySelector('.step[hidden]');if(s){s.hidden=false;s.querySelector('details').open=true;}if(!document.querySelector('.step[hidden]')){this.disabled=true;this.textContent='All steps shown';}};</script></html>`,
);
for (const name of ['website-functions.md', 'submission.md', 'llm-role.md', 'agentic-readiness.md'])
  copyFileSync(`docs/${name}`, `${dir}/${name}`);
console.log(
  'Portable evidence viewer saved to artifacts/submission/index.html. Not published. Review observed logs before sharing.',
);
copyFileSync('docs/website-functions.md', `${dir}/README.md`);
