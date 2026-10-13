// Real browser text-contrast gate. Both themes must pass; a historical failure
// count is not an acceptance threshold. This is not complete accessibility QA.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  // V-C play-along: the drill under the tone generator, idle with the microphone off, then
  // after Start with no microphone to hear (the notice explains why nothing began).
  const drill=page.locator('.call-response');
  if(await drill.isVisible()){
    await drill.scrollIntoViewIfNeeded();
    await record('tune/call-response','.call-response');
    await drill.getByRole('button',{name:'Strict',exact:true}).click();
    await drill.getByRole('button',{name:'Start',exact:true}).click();
    await drill.locator('.call-response-notice').waitFor();
    await record('tune/call-response-mic-off','.call-response');
    await drill.getByRole('button',{name:'Standard',exact:true}).click();
  }
  const targetPicker=page.locator('.target-lock-picker select');
  if(await targetPicker.isVisible()){
    const options=await targetPicker.locator('option').all();
    if(options.length>1){await targetPicker.selectOption({index:1});await record('tune/target-locked');await targetPicker.selectOption('');}
  }
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
  await page.locator('.analysis-tabs button').filter({hasText:'Spectrogram'}).click();await record('analyze/spectrogram-idle','.analysis-card');
  // A/B take overlay: import two tiny fixtures (no microphone needed) and
  // pick the second as the compare target, exercising the take library's
  // tag/sort/filter controls and TakePitchTrace's overlay legend/diff text.
  const takeFileInput=page.locator('.take-card input[type="file"]');
  await takeFileInput.setInputFiles({name:'theme-audit-a.wav',mimeType:'audio/wav',buffer:wavFixture()});
  await page.locator('.take-list button').first().waitFor();
  await takeFileInput.setInputFiles({name:'theme-audit-b.wav',mimeType:'audio/wav',buffer:wavFixture()});
  await page.waitForFunction(()=>document.querySelectorAll('.take-list button').length>=2);
  await page.waitForFunction(()=>!document.querySelector('.take-pitch-progress'));
  await page.getByLabel('Compare with').selectOption({index:1});
  await page.waitForFunction(()=>document.querySelector('.take-compare-diff')||document.querySelector('.take-pitch-compare-status'));
  await record('analyze/compare','.take-card');
  await select(3);await record('pulse');
  await select(2);await page.waitForTimeout(500);await record('lab/learn');
  if(await page.locator('.call-response').isVisible())await record('lab/learn-call-response','.call-response');
  // Vocal workspace: audit the guided warm-up routine as well as the step cards.
  const vocalCard=page.locator('.vocal-studio-card').first();
  if(await vocalCard.isVisible()){
    await vocalCard.click();await page.locator('.vocal-routine').waitFor();await record('vocal/routine','.vocal-routine');
    // V-A: the dark stage with the pitch graph (idle, then held), the range
    // card (a stored range is seeded by the init script), the range finder's
    // in-progress prompt and each warm-up card driving the graph.
    await record('vocal/graph','.vocal-stage');
    // V-C play-along on the Vocal stage.
    await record('vocal/call-response','.call-response');
    await page.getByRole('button',{name:'Hold',exact:true}).click();
    await page.locator('.vocal-graph.is-held').waitFor();
    await record('vocal/graph-held','.vocal-stage');
    await page.getByRole('button',{name:'Back to live graph'}).click();
    await page.locator('.vocal-range-card').waitFor();
    await record('vocal/range-card','.vocal-range');
    await page.getByRole('button',{name:'Record again'}).click();
    await page.locator('.vocal-capture-hud').waitFor();
    await record('vocal/range-capture','.vocal-stage');
    await page.getByRole('button',{name:'Cancel'}).click();
    const toggles=page.locator('.vocal-live-toggle');
    for(const [index,state] of [[0,'vocal/sustain'],[1,'vocal/glide'],[2,'vocal/start-cleanly']]){
      await toggles.nth(index).click();
      await page.locator('.vocal-live-body').waitFor();
      await record(state,'.vocal-routine');
    }
    await toggles.nth(2).click();
    // V-B: saved vocal takes (two are written straight into the take library,
    // since there is no microphone here), the melody picker, the editor with
    // notes in it, and a finished pass. Switching workspace and back remounts
    // the Vocal stage so it reads the library again.
    await page.evaluate(async(bytes)=>{
      const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('bocal-analysis-takes',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('takes'))request.result.createObjectStore('takes',{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('takes','readwrite');const store=tx.objectStore('takes');
        [['theme-vocal-a',0],['theme-vocal-b',60000]].forEach(([id,age],index)=>store.put({id,name:'Vocal take '+(index+1),createdAt:new Date(Date.now()-age).toISOString(),seconds:12+index,mime:'audio/wav',blob:new Blob([new Uint8Array(bytes)],{type:'audio/wav'}),kind:'vocal'}));
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
      });
      db.close();
    },Array.from(wavFixture()));
    await select(1);await select(2);
    await page.locator('.vocal-take-list li').first().waitFor();
    await page.waitForFunction(()=>!document.querySelector('.vocal-take-detail .take-pitch-progress'),undefined,{timeout:20000});
    await record('vocal/takes','.vocal-takes');
    await page.getByLabel('Compare with').selectOption({index:1});
    await page.waitForFunction(()=>document.querySelector('.vocal-take-detail .take-compare-diff')||document.querySelector('.vocal-take-detail .take-pitch-compare-status'));
    await record('vocal/takes-compare','.vocal-takes');
    await record('vocal/melody','.vocal-melody');
    await page.getByRole('button',{name:'New melody'}).click();
    await page.getByRole('button',{name:'Add note'}).click();
    await page.getByLabel('Next note').selectOption('62');
    await page.getByRole('button',{name:'Add note'}).click();
    await record('vocal/melody-editor','.vocal-melody');
    await page.getByRole('button',{name:'Cancel'}).click();
    await page.locator('.vocal-melody-choice').filter({hasText:'Five-note scale'}).click();
    await page.getByRole('button',{name:'Play pass'}).click();
    await page.getByText('Playing. Sing along to the bands on the graph.').waitFor();
    await record('vocal/melody-playing','.vocal-melody');
    await page.getByRole('button',{name:'Clear pass'}).waitFor({timeout:20000});
    await record('vocal/melody-pass-done','.vocal-melody');
    await page.getByRole('button',{name:'Clear pass'}).click();
  }
  const challenge=page.locator('.lab-mode-switch button').filter({hasText:'Challenge'});
  if(await challenge.isVisible()){await challenge.click();await record('lab/challenge','.fingering-panel');}
  await select(5);await record('practice');
}

// Harmonica hole chart: the comb, its controls and the side panel, with the
// opt-in advanced rows and the chromatic slide-in shown, since each of those
// adds text on its own surface.
async function walkHarmonica(page,theme,instrument,results){
  const record=async(state,scope)=>{
    const text=await textAudit(page,scope);
    assert.ok(Array.isArray(text),`${instrument}/${state}: missing required scope ${scope}`);
    results.push({theme,instrument,state,text});
    if(text.length){console.log(`${theme}/${instrument}/${state}: ${text.length} contrast failures`);for(const f of text)console.log(`  ${f.sel} "${f.text}" ${f.ratio}:1, need ${f.threshold}, ${f.fg} on ${f.bg}`);}
  };
  await page.locator('.mobile-nav button[aria-keyshortcuts="2"]').click();
  await page.locator('.harmonica-lab .harmonica-comb').waitFor();
  await page.waitForTimeout(300);
  await record('harmonica/chart','.harmonica-lab');
  const advanced=page.locator('.harmonica-toggle').filter({hasText:'Overblows'});
  if(await advanced.count()){await advanced.click();await record('harmonica/advanced','.harmonica-lab');}
  const slide=page.locator('.harmonica-toggle').filter({hasText:'Slide in'});
  if(await slide.count()){await slide.click();await record('harmonica/slide-in','.harmonica-lab');}
  await page.locator('.harmonica-comb .hc-cell').nth(3).click();await record('harmonica/selected','.harmonica-lab');
  await page.getByRole('button',{name:'Choose instrument',exact:true}).click();
  await page.waitForTimeout(200);
  await record('harmonica/picker-free-reed','.experience-overlay');
}

// V-C play-along result state. Chromium's fake microphone plays this WAV: five
// steady notes (the Five-note scale, C4 to G4) sung after a lead of silence that
// lines up with the drill's phrase and count-in, so a real round runs end to end
// and the drill's result is on screen. Whether it reads "matched" or "not yet"
// does not matter here; the audit checks the text contrast of that state.
function sungPhraseWav(){
  const rate=48000,lead=5.2,hold=0.75,gap=0.1,notes=[60,62,64,65,67];
  const total=Math.round((lead+notes.length*(hold+gap)+10)*rate);
  const samples=new Int16Array(total);
  let at=Math.round(lead*rate);
  for(const midi of notes){
    const hz=440*2**((midi-69)/12),count=Math.round(hold*rate);
    for(let i=0;i<count;i++)samples[at+i]=Math.round(9000*Math.min(1,i/600,(count-i)/600)*Math.sin(2*Math.PI*hz*i/rate));
    at+=count+Math.round(gap*rate);
  }
  const bytes=Buffer.alloc(44+total*2);
  bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);
  bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);
  bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);
  bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(total*2,40);
  for(let i=0;i<total;i++)bytes.writeInt16LE(samples[i],44+i*2);
  return bytes;
}

async function walkDrillResult(page,theme,instrument,results){
  const record=async(state,scope)=>{
    const text=await textAudit(page,scope);
    assert.ok(Array.isArray(text),`${instrument}/${state}: missing required scope ${scope}`);
    results.push({theme,instrument,state,text});
    if(text.length){console.log(`${theme}/${instrument}/${state}: ${text.length} contrast failures`);for(const f of text)console.log(`  ${f.sel} "${f.text}" ${f.ratio}:1, need ${f.threshold}, ${f.fg} on ${f.bg}`);}
  };
  await page.locator('.mobile-nav button[aria-keyshortcuts="2"]').click();
  const drill=page.locator('.call-response');
  await drill.waitFor();
  await drill.scrollIntoViewIfNeeded();
  await drill.getByRole('button',{name:'Start',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.call-response')?.getAttribute('data-state')==='playing',null,{timeout:20000});
  await record('vocal/call-response-playing','.call-response');
  await page.waitForFunction(()=>document.querySelector('.call-response')?.getAttribute('data-state')==='scored',null,{timeout:60000});
  await record('vocal/call-response-result','.call-response');
}

// Tiny synthetic WAV so the A/B compare state below has two real takes to
// pick from, the same fixture shape tests/production-smoke.mjs already uses
// to exercise the take library without a real microphone.
function wavFixture(){
  const sampleRate=16000,samples=3200;
  const bytes=Buffer.alloc(44+samples*2);
  bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);
  bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);
  bytes.writeUInt32LE(sampleRate,24);bytes.writeUInt32LE(sampleRate*2,28);
  bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++)bytes.writeInt16LE(Math.round(3000*Math.sin(2*Math.PI*440*i/sampleRate)),44+i*2);
  return bytes;
}

const preview=await servePreview(DIST);
const browser=await launchChromium();
const failures=[],counts={};
try {
  for(const theme of ['light','dark'])for(const instrument of ['alto-sax','guitar','clarinet','oboe','vocal']){
    const context=await browser.newContext({viewport:{width:412,height:915}});
    try {
      const page=await context.newPage();page.setDefaultTimeout(10000);
      // Playwright accepts ONE argument. The old second positional argument was
      // ignored, leaving the instrument undefined and testing alto twice.
      await page.addInitScript(({theme,instrument})=>{
        localStorage.setItem('bocal-onboarding-v2','complete');localStorage.setItem('bocal-theme',theme);localStorage.setItem('bocal-instrument',instrument);
        if(instrument==='vocal')localStorage.setItem('bocal-vocal-range-v1',JSON.stringify({low:45,high:69,savedAt:1760000000000}));
      },{theme,instrument});
      await page.goto(preview.url);await page.locator('.app-shell').waitFor();await page.waitForTimeout(400);
      assert.equal(await page.locator('.onboarding-overlay').count(),0,'Completed onboarding must stay dismissed');
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme);
      const results=[];await walkStates(page,theme,instrument,results);
      for(const result of results){counts[`${theme}/${instrument}/${result.state}`]=result.text.length;for(const item of result.text)failures.push({theme,instrument,state:result.state,...item});}
    } finally {await context.close();}
  }
  for(const theme of ['light','dark'])for(const instrument of ['diatonic-harmonica','chromatic-harmonica']){
    const context=await browser.newContext({viewport:{width:412,height:915}});
    try {
      const page=await context.newPage();page.setDefaultTimeout(10000);
      await page.addInitScript(({theme,instrument})=>{
        localStorage.setItem('bocal-onboarding-v2','complete');localStorage.setItem('bocal-theme',theme);localStorage.setItem('bocal-instrument',instrument);
      },{theme,instrument});
      await page.goto(preview.url);await page.locator('.app-shell').waitFor();await page.waitForTimeout(400);
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme);
      const results=[];await walkHarmonica(page,theme,instrument,results);
      for(const result of results){counts[`${theme}/${instrument}/${result.state}`]=result.text.length;for(const item of result.text)failures.push({theme,instrument,state:result.state,...item});}
    } finally {await context.close();}
  }
  // The drill's playing and result states need a microphone that hears something.
  for(const theme of ['light','dark']){
    const wavDir=mkdtempSync(path.join(tmpdir(),'bocal-sung-'));
    const wav=path.join(wavDir,'phrase.wav');
    writeFileSync(wav,sungPhraseWav());
    const micBrowser=await launchChromium({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${wav}%noloop`,'--autoplay-policy=no-user-gesture-required']});
    try {
      const context=await micBrowser.newContext({viewport:{width:412,height:915},permissions:['microphone']});
      const page=await context.newPage();page.setDefaultTimeout(10000);
      await page.addInitScript(({theme})=>{
        localStorage.setItem('bocal-onboarding-v2','complete');localStorage.setItem('bocal-theme',theme);localStorage.setItem('bocal-instrument','vocal');
      },{theme});
      await page.goto(preview.url);await page.locator('.app-shell').waitFor();await page.waitForTimeout(400);
      const results=[];await walkDrillResult(page,theme,'vocal',results);
      for(const result of results){counts[`${theme}/vocal/${result.state}`]=result.text.length;for(const item of result.text)failures.push({theme,instrument:'vocal',state:result.state,...item});}
    } finally {await micBrowser.close();rmSync(wavDir,{recursive:true,force:true});}
  }
} finally {
  await browser.close();await preview.close();
  writeFileSync(path.join(reportDir,'contrast.json'),JSON.stringify({counts,failures,scope:'DOM text contrast in recorded states, not full accessibility certification',exemptions:'Disabled controls, skip link and documented SVG/gradient artefacts in AUDIT_FN'},null,2));
}
if(process.env.THEME_AUDIT_DUMP)writeFileSync(process.env.THEME_AUDIT_DUMP,JSON.stringify(counts,null,2));
console.log(`Contrast: ${Object.keys(counts).length} states, ${failures.length} failures across both themes.`);
assert.equal(failures.length,0,'Both light AND dark text contrast must pass. See qa/reports/contrast.json.');
