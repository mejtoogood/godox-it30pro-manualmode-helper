import {DEFAULT_GN,FSTOP_LABELS,FSTOP_VALUES,clamp,powerFraction,powerLabel,requiredPower,normalizedGN,resolveGN} from './core.mjs';

const STORE='flash-meter-pwa-v1';
const defaults={iso:400,apertureIndex:12,distance:2,mode:'N',fillEV:-1,baseGN:DEFAULT_GN,wideLossEV:1,records:[]};
const $=id=>document.getElementById(id);
const validNumber=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const fmt=(n,d=1)=>Number(n).toFixed(d);
const fmtEV=n=>`${n>=0?'+':'−'}${Math.abs(n).toFixed(1)} EV`;
let stored;
try{stored=JSON.parse(localStorage.getItem(STORE))}catch{stored=null}
let state=validateState(stored);
let toastTimeout;

function validateRecord(r){
  return r && (r.mode==='N'||r.mode==='W') && validNumber(r.iso,12,25600) && validNumber(r.distance,.1,100)
    && Number.isInteger(r.powerStep) && r.powerStep>=0 && r.powerStep<=21
    && validNumber(r.aperture,.7,90) && Number.isInteger(r.tenths) && r.tenths>=0 && r.tenths<=9;
}
function validateState(input){
  const s={...defaults,records:[]};
  if(!input||typeof input!=='object')return s;
  if(validNumber(input.iso,12,25600))s.iso=input.iso;
  if(Number.isInteger(input.apertureIndex)&&input.apertureIndex>=0&&input.apertureIndex<FSTOP_VALUES.length)s.apertureIndex=input.apertureIndex;
  if(validNumber(input.distance,.1,100))s.distance=input.distance;
  if(input.mode==='W'||input.mode==='N')s.mode=input.mode;
  if(Number.isInteger(input.fillEV)&&input.fillEV<=0&&input.fillEV>=-4)s.fillEV=input.fillEV;
  if(validNumber(input.baseGN,1,100))s.baseGN=input.baseGN;
  if(validNumber(input.wideLossEV,0,3.01))s.wideLossEV=input.wideLossEV;
  if(Array.isArray(input.records))s.records=input.records.filter(validateRecord).slice(0,1000).map(r=>({
    id:typeof r.id==='string'?r.id.slice(0,64):crypto.randomUUID(),mode:r.mode,iso:r.iso,distance:r.distance,powerStep:r.powerStep,aperture:r.aperture,tenths:r.tenths,createdAt:typeof r.createdAt==='string'?r.createdAt.slice(0,40):new Date().toISOString()
  }));
  return s;
}
function save(){try{localStorage.setItem(STORE,JSON.stringify(state))}catch{toast('Local storage is unavailable; export measurements to keep them.')}}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>t.classList.remove('show'),3500)}
function init(){
  $('fillChips').innerHTML=[0,-1,-2,-3,-4].map(v=>`<button type="button" data-fill="${v}" aria-pressed="false">${v===0?'0':`−${Math.abs(v)}`}</button>`).join('');
  $('apertureSelect').innerHTML=FSTOP_LABELS.map((f,i)=>`<option value="${i}">f/${f}</option>`).join('');
  $('calPower').innerHTML=Array.from({length:22},(_,i)=>`<option value="${i}">${powerLabel(i)}</option>`).join('');
  $('calTenths').innerHTML=Array.from({length:10},(_,i)=>`<option value="${i}">+${(i/10).toFixed(1)} EV</option>`).join('');
  $('calPower').value='6';
  $('fillChips').addEventListener('click',e=>{const v=e.target.closest('[data-fill]')?.dataset.fill;if(v!==undefined){state.fillEV=Number(v);changed()}});
  $('modeControl').addEventListener('click',e=>{const mode=e.target.closest('[data-mode]')?.dataset.mode;if(mode==='N'||mode==='W'){state.mode=mode;changed()}});
  $('apertureSelect').addEventListener('change',e=>{state.apertureIndex=Number(e.target.value);changed()});
  $('apertureDown').addEventListener('click',()=>{state.apertureIndex=clamp(state.apertureIndex-1,0,FSTOP_VALUES.length-1);changed()});
  $('apertureUp').addEventListener('click',()=>{state.apertureIndex=clamp(state.apertureIndex+1,0,FSTOP_VALUES.length-1);changed()});
  $('distanceSlider').addEventListener('input',e=>{state.distance=Number(e.target.value);changed()});
  $('distanceInput').addEventListener('change',e=>{const x=Number(e.target.value);if(validNumber(x,.1,100)){state.distance=x;changed()}else{render();toast('Distance must be 0.1–100 m.')}});
  $('isoInput').addEventListener('change',e=>{const x=Number(e.target.value);if(validNumber(x,12,25600)){state.iso=x;changed()}else{render();toast('ISO must be between 12 and 25,600.')}});
  $('isoDown').addEventListener('click',()=>{state.iso=Math.max(12,Math.round(state.iso/2));changed()});
  $('isoUp').addEventListener('click',()=>{state.iso=Math.min(25600,state.iso*2);changed()});
  $('baseGN').addEventListener('change',e=>{const x=Number(e.target.value);if(validNumber(x,1,100)){state.baseGN=x;changed()}else{render();toast('Guide number must be between 1 and 100.')}});
  $('wideLoss').addEventListener('input',e=>{state.wideLossEV=clamp(Math.round(Number(e.target.value)*3)/3,0,3);changed()});
  $('calibrationForm').addEventListener('submit',submitCalibration);
  $('recordList').addEventListener('click',e=>{const id=e.target.closest('[data-delete]')?.dataset.delete;if(!id)return;state.records=state.records.filter(r=>r.id!==id);changed();toast('Measurement deleted')});
  $('clearRecords').addEventListener('click',()=>{if(state.records.length&&confirm(`Delete all ${state.records.length} calibration measurements?`)){state.records=[];changed();toast('All measurements cleared')}});
  $('resetSettings').addEventListener('click',()=>{if(confirm('Reset model and calculator controls? Saved calibration records will be kept.')){state={...defaults,records:state.records};changed();toast('Defaults restored')}});
  $('exportData').addEventListener('click',exportData);
  $('importData').addEventListener('change',importData);
  document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>goPage(b.dataset.page)));
  render();
  if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{/* Calculator remains functional if caching is unavailable. */})}
}
function changed(){save();render()}
function writePower(id,step){const p=powerLabel(step).split(' +');$(id).replaceChildren(document.createTextNode(p[0]));if(p[1]){const sm=document.createElement('small');sm.textContent='+'+p[1];$(id).appendChild(document.createTextNode(' '));$(id).appendChild(sm)}}
function render(){
  const s=state,iso=s.iso,f=FSTOP_VALUES[s.apertureIndex];
  const source=resolveGN(s.records,s.mode,s.baseGN,s.wideLossEV);
  const result=requiredPower({gn100:source.gn,iso,aperture:f,distance:s.distance,fillEV:s.fillEV});
  writePower('powerValue',result.step);
  $('powerDetail').textContent=`${s.mode} beam · ${fmt(s.distance)} m · ISO ${s.iso}`;
  const msg=$('powerWarning');msg.hidden=result.status==='ok';
  if(result.status==='too-weak')msg.textContent=`Insufficient flash · ${fmtEV(Math.log2(result.required))} needed`;
  if(result.status==='too-strong')msg.textContent=`Excess flash · −${(Math.log2((1/128)/result.required)).toFixed(1)} EV needed`;
  $('flashSummary').textContent=s.fillEV===0?'Full flash':`${fmtEV(s.fillEV)} fill`;
  $('modelTag').textContent=source.source==='measured'?'CALIBRATED':'ESTIMATE';
  $('isoInput').value=String(s.iso);
  $('isoDown').disabled=s.iso<=12;
  $('isoUp').disabled=s.iso>=25600;
  $('apertureSelect').value=String(s.apertureIndex);
  $('apertureDown').disabled=s.apertureIndex===0;
  $('apertureUp').disabled=s.apertureIndex===FSTOP_VALUES.length-1;
  $('distanceSlider').value=String(clamp(s.distance,.5,10));$('distanceInput').value=String(s.distance);
  document.querySelectorAll('[data-mode]').forEach(b=>{const on=b.dataset.mode===s.mode;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on))});
  document.querySelectorAll('[data-fill]').forEach(b=>{const on=Number(b.dataset.fill)===s.fillEV;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on))});
  const n=resolveGN(s.records,'N',s.baseGN,s.wideLossEV),w=resolveGN(s.records,'W',s.baseGN,s.wideLossEV);
  $('normalCalGN').textContent=`GN ${fmt(n.gn)}`;$('wideCalGN').textContent=`GN ${fmt(w.gn)}`;
  $('normalCalSource').textContent=n.source==='measured'?`${n.samples} measured sample${n.samples===1?'':'s'}`:'Manufacturer estimate';
  $('wideCalSource').textContent=w.source==='measured'?`${w.samples} measured sample${w.samples===1?'':'s'}`:w.source==='derived'?'Provisional from N reading':'Provisional W correction';
  $('recordCount').textContent=`${s.records.length} saved`;
  $('clearRecords').disabled=s.records.length===0;
  renderRecords();$('baseGN').value=String(s.baseGN);$('wideLoss').value=String(s.wideLossEV);$('wideLossValue').textContent=`${fmt(s.wideLossEV)} EV`;
}
function renderRecords(){
  const container=$('recordList');container.replaceChildren();
  if(!state.records.length){const p=document.createElement('p');p.className='empty';p.textContent='No measurements yet. Calculations use the manufacturer GN and a provisional W-mode offset.';container.append(p);return}
  for(const r of [...state.records].reverse()){
    const row=document.createElement('div');row.className='record';
    const title=document.createElement('strong');title.textContent=`${r.mode} · ${powerLabel(r.powerStep)} · ${fmt(r.distance)} m`;
    const details=document.createElement('small');details.textContent=`ISO ${r.iso} · f/${r.aperture}${r.tenths?' +'+(r.tenths/10).toFixed(1):''} · ${r.createdAt.slice(0,10)}`;
    const gn=document.createElement('em');gn.textContent=`GN ${fmt(normalizedGN(r))} (normalized)`;
    const del=document.createElement('button');del.type='button';del.textContent='Delete';del.dataset.delete=r.id;del.setAttribute('aria-label','Delete measurement');
    row.append(title,details,gn,del);container.append(row);
  }
}
function submitCalibration(e){
  e.preventDefault();
  const record={id:crypto.randomUUID(),mode:$('calMode').value,iso:Number($('calISO').value),distance:Number($('calDistance').value),powerStep:Number($('calPower').value),aperture:Number($('calAperture').value),tenths:Number($('calTenths').value),createdAt:new Date().toISOString()};
  if(!validateRecord(record)){toast('Please check the calibration values.');return}
  if(state.records.length>=1000){toast('Maximum 1,000 records. Export then remove old records.');return}
  state.records.push(record);changed();$('calAperture').value='';$('calTenths').value='0';toast(`Saved ${record.mode} reading · GN ${fmt(normalizedGN(record))}`);
}
function goPage(name){
  for(const el of document.querySelectorAll('.page'))el.classList.toggle('active',el.id===`${name}Page`);
  for(const b of document.querySelectorAll('[data-page]')){const selected=b.dataset.page===name;b.classList.toggle('selected',selected);if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')}
  window.scrollTo({top:0,behavior:'instant'});
}
function exportData(){
  const data={application:'flash-meter-it30pro',version:1,exportedAt:new Date().toISOString(),state};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`godox-flash-calibration-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('JSON backup exported');
}
async function importData(e){
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  if(file.size>1024*1024){toast('Backup file too large.');return}
  try{const data=JSON.parse(await file.text());if(data.application!=='flash-meter-it30pro'||data.version!==1||!data.state||!Array.isArray(data.state.records))throw Error('Invalid backup format');
    if(!confirm(`Replace settings and ${state.records.length} saved measurement(s) with this backup?`))return;
    state=validateState(data.state);changed();toast(`Imported ${state.records.length} measurements`);
  }catch{toast('Cannot import: invalid JSON backup.')}}
init();