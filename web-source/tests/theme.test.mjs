// Real browser text-contrast gate. Both themes must pass; a historical failure
// count is not an acceptance threshold. This is not complete accessibility QA.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { launchChromium } from "./browser.mjs";
import { servePreview } from "./preview-server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.THEME_AUDIT_DIST || path.resolve(HERE, "../preview-dist/index.html");
if (!existsSync(DIST)) {
  if (process.env.BOCAL_REQUIRE_PREVIEW === "1") throw new Error("Required preview build is missing.");
  console.log("theme audit: browser gate runs after preview:standalone, not in the unbuilt unit suite.");
  process.exit(0);
}
const reportDir = path.resolve(HERE, "../../qa/reports");
mkdirSync(reportDir, { recursive: true });

const AUDIT_FN = `(() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const parts = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number); const [r,g,b,a=1] = parts; return {r,g,b,a}; };
  const lum = ({r,g,b}) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
  const blend = (fg,bg) => ({r:fg.r*fg.a+bg.r*(1-fg.a),g:fg.g*fg.a+bg.g*(1-fg.a),b:fg.b*fg.a+bg.b*(1-fg.a),a:1});
  const ratioOf = (a,b) => { const x=lum(a),y=lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); };
  const hex = c => '#'+[c.r,c.g,c.b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
  const rootBg = parse(getComputedStyle(document.documentElement).backgroundColor) || {r:6,g:6,b:7,a:1};
  const layerOf = (n,pseudo) => {
    const cs=getComputedStyle(n,pseudo);
    if(pseudo && (cs.content==='none'||cs.content==='normal'||cs.position!=='absolute'))return null;
    const layers=[];
    const bi=cs.backgroundImage;
    if(bi && bi!=='none') {
      const stops=[...bi.matchAll(/rgba?\\([^)]+\\)/g)].map(m=>parse(m[0])).filter(Boolean);
      if(stops.length){const avg=stops.reduce((a,c)=>({r:a.r+c.r*c.a/stops.length,g:a.g+c.g*c.a/stops.length,b:a.b+c.b*c.a/stops.length}),{r:0,g:0,b:0});const cover=stops.reduce((a,c)=>a+c.a,0)/stops.length;layers.push({...avg,a:cover});}
    }
    const c=parse(cs.backgroundColor);if(c&&c.a>0)layers.push(c);
    return {layers,op:Number(cs.opacity)};
  };
  const effBg = el => {
    let bg=rootBg;const chain=[];for(let n=el;n;n=n.parentElement)chain.push(n);chain.reverse();
    for(const n of chain){const own=layerOf(n,null);for(const l of own.layers)bg=blend(l,bg);if(n!==el){const after=layerOf(n,'::after');if(after)for(const l of after.layers)bg=blend({...l,a:l.a*after.op},bg);}}
    return bg;
  };
  const visible=el=>{const r=el.getBoundingClientRect();if(!r.width||!r.height)return false;const cs=getComputedStyle(el);return cs.visibility!=='hidden'&&cs.display!=='none'&&Number(cs.opacity)!==0;};
  const opacityOf=el=>{let op=1;for(let n=el;n;n=n.parentElement)op*=Number(getComputedStyle(n).opacity);return op;};
  // Existing documented exclusions: SVG-painted nav tracks, positioned gradients,
  // the shadow-filled goal ring and blend-mode artwork need screenshot/manual QA.
  const artefacts=['.dock-pill button','.mobile-nav.is-arc button','.variant-visual','.gentle-win-card','.goal-ring','.other-instruments-heading'];
  const isExempt=el=>{for(let n=el;n;n=n.parentElement){if(n.classList?.contains('skip-to-content')||n.disabled===true||n.getAttribute?.('aria-disabled')==='true')return true;for(const s of artefacts)if(n.matches?.(s))return true;}return false;};
  const sel=el=>{const parts=[];for(let n=el,i=0;n&&n!==document.body&&i<3;n=n.parentElement,i++){const cls=(typeof n.className==='string'?n.className:'').trim().split(/\\s+/).filter(Boolean).slice(0,2).join('.');parts.unshift(n.tagName.toLowerCase()+(cls?'.'+cls:''));}return parts.join(' > ');};
  return {parse,lum,blend,ratioOf,hex,effBg,visible,opacityOf,isExempt,sel};
})()`;

const textAudit=(page,scope)=>page.evaluate(({helpers,scope})=>{
  const H=eval(helpers);
  const root=scope?document.querySelector(scope):document.body;
  if(!root)return {error:'no scope '+scope};
  const out=[],seen=new Set();
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
    const t=walker.currentNode,text=t.textContent.trim();if(text.length<2)continue;
    const el=t.parentElement;if(!el||seen.has(el))continue;seen.add(el);
    if(!H.visible(el)||H.isExempt(el))continue;
    const cs=getComputedStyle(el),fg=H.parse(cs.color);if(!fg)continue;
    const bg=H.effBg(el),fgb=H.blend({...fg,a:fg.a*H.opacityOf(el)},bg),ratio=H.ratioOf(fgb,bg);
    const px=parseFloat(cs.fontSize),large=px>=24||(px>=18.66&&Number(cs.fontWeight)>=700),threshold=large?3:4.5;
    if(ratio<threshold)out.push({ratio:+ratio.toFixed(2),threshold,px,text:text.slice(0,34),sel:H.sel(el),fg:H.hex(fgb),bg:H.hex(bg)});
  }
  return out.sort((a,b)=>a.ratio-b.ratio);
},{helpers:AUDIT_FN,scope});

async function walkStates(page,theme,instrument,results){
  const record=async(state,scope)=>{
    const text=await textAudit(page,scope);
    assert.ok(Array.isArray(text),`${instrument}/${state}: missing required scope ${scope}`);
    results.push({theme,instrument,state,text});
    if(text.length){console.log(`${theme}/${instrument}/${state}: ${text.length} contrast failures`);for(const f of text)console.log(`  ${f.sel} "${f.text}" ${f.ratio}:1, need ${f.threshold}, ${f.fg} on ${f.bg}`);}
  };
  const select=async digit=>{
    const button=page.locator(`.mobile-nav button[aria-keyshortcuts="${digit}"]`);
    await button.click();
    await page.waitForFunction(d=>document.querySelector(`.mobile-nav button[aria-keyshortcuts="${d}"]`)?.getAttribute('aria-current')==='page',digit);
    await page.waitForTimeout(200);
  };
  await select(1);await record('tune');
  const calibration=page.locator('.calibration-toggle');
  if(await calibration.isVisible()){await calibration.click();await record('tune/calibration-open','.calibration-picker');await calibration.click();}
  await page.getByRole('button',{name:'Choose instrument',exact:true}).click();
  await record('instrument-picker-overlay','.experience-overlay');
  await page.getByRole('button',{name:'Close instrument selection'}).click();
  await page.getByRole('button',{name:'Open settings and handoff'}).click();
  await record('overflow-menu','.download-overlay');
  await page.locator('.download-dialog > header > button').click();
  await select(4);await page.locator('.analysis-tabs').waitFor();await record('analyze');
  await page.locator('.analysis-tabs button').filter({hasText:'Harmonics'}).click();await record('analyze/harmonics-idle','.analysis-card');
  await select(3);await record('pulse');
  await select(2);await page.waitForTimeout(500);await record('lab/learn');
  const challenge=page.locator('.lab-mode-switch button').filter({hasText:'Challenge'});
  if(await challenge.isVisible()){await challenge.click();await record('lab/challenge','.fingering-panel');}
  await select(5);await record('practice');
}

const preview=await servePreview(DIST);
const browser=await launchChromium();
const failures=[],counts={};
try {
  for(const theme of ['light','dark'])for(const instrument of ['alto-sax','guitar','clarinet','oboe']){
    const context=await browser.newContext({viewport:{width:412,height:915}});
    try {
      const page=await context.newPage();page.setDefaultTimeout(10000);
      // Playwright accepts ONE argument. The old second positional argument was
      // ignored, leaving the instrument undefined and testing alto twice.
      await page.addInitScript(({theme,instrument})=>{
        localStorage.setItem('bocal-onboarding-v2','complete');localStorage.setItem('bocal-theme',theme);localStorage.setItem('bocal-instrument',instrument);
      },{theme,instrument});
      await page.goto(preview.url);await page.locator('.app-shell').waitFor();await page.waitForTimeout(400);
      assert.equal(await page.locator('.onboarding-overlay').count(),0,'Completed onboarding must stay dismissed');
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme);
      const results=[];await walkStates(page,theme,instrument,results);
      for(const result of results){counts[`${theme}/${instrument}/${result.state}`]=result.text.length;for(const item of result.text)failures.push({theme,instrument,state:result.state,...item});}
    } finally {await context.close();}
  }
} finally {
  await browser.close();await preview.close();
  writeFileSync(path.join(reportDir,'contrast.json'),JSON.stringify({counts,failures,scope:'DOM text contrast in recorded states, not full accessibility certification',exemptions:'Disabled controls, skip link and documented SVG/gradient artefacts in AUDIT_FN'},null,2));
}
if(process.env.THEME_AUDIT_DUMP)writeFileSync(process.env.THEME_AUDIT_DUMP,JSON.stringify(counts,null,2));
console.log(`Contrast: ${Object.keys(counts).length} states, ${failures.length} failures across both themes.`);
assert.equal(failures.length,0,'Both light AND dark text contrast must pass. See qa/reports/contrast.json.');
