import {DEFAULT_GN,FSTOP_LABELS,FSTOP_VALUES,clamp,powerFraction,powerLabel,requiredPower,rangeFor,tableDistances,normalizedGN,fittedGN,resolveGN} from './core.mjs';

const STORE='flash-meter-pwa-v1';
const defaults={iso:400,apertureIndex:12,distance:2,mode:'N',fillEV:-1,gnN:DEFAULT_GN,gnW:10.6,records:[]};
const TABLE_ISOS=[25,50,100,200,400,800,1600,3200,6400,12800,25600];
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
  if(validNumber(input.distance,.1,10000))s.distance=input.distance;
  if(input.mode==='W'||input.mode==='N')s.mode=input.mode;
  if(Number.isInteger(input.fillEV)&&input.fillEV<=0&&input.fillEV>=-4)s.fillEV=input.fillEV;
  if(Array.isArray(input.records))s.records=input.records.filter(validateRecord).slice(0,1000).map(r=>({
    id:typeof r.id==='string'?r.id.slice(0,64):crypto.randomUUID(),mode:r.mode,iso:r.iso,distance:r.distance,powerStep:r.powerStep,aperture:r.aperture,tenths:r.tenths,createdAt:typeof r.createdAt==='string'?r.createdAt.slice(0,40):new Date().toISOString()
  }));
  // Import old saved states without abruptly changing their effective flash output.
  // Once converted, new readings never modify these active guide numbers.
  if(validNumber(input.gnN,.1,500))s.gnN=input.gnN;
  else if('baseGN' in input || 'wideLossEV' in input)
    s.gnN=resolveGN(s.records,'N',validNumber(input.baseGN,1,100)?input.baseGN:15,validNumber(input.wideLossEV,0,3.01)?input.wideLossEV:1).gn;
  if(validNumber(input.gnW,.1,500))s.gnW=input.gnW;
  else if('baseGN' in input || 'wideLossEV' in input)
    s.gnW=resolveGN(s.records,'W',validNumber(input.baseGN,1,100)?input.baseGN:15,validNumber(input.wideLossEV,0,3.01)?input.wideLossEV:1).gn;
  return s;
}
function activeGN(mode){return mode==='W'?state.gnW:state.gnN;}
function save(){try{localStorage.setItem(STORE,JSON.stringify(state))}catch{toast('Local storage is unavailable; export measurements to keep them.')}}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>t.classList.remove('show'),3500)}
function init(){
  for(const id of ['fillChips','tableFillChips'])$(id).innerHTML=[0,-1,-2,-3,-4].map(v=>`<button type="button" data-fill="${v}" aria-pressed="false">${v===0?'0':`−${Math.abs(v)}`}</button>`).join('');
  $('apertureSelect').innerHTML=FSTOP_LABELS.map((f,i)=>`<option value="${i}">f/${f}</option>`).join('');
  $('calPower').innerHTML=Array.from({length:22},(_,i)=>`<option value="${i}">${powerLabel(i)}</option>`).join('');
  $('calTenths').innerHTML=Array.from({length:10},(_,i)=>`<option value="${i}">${i}</option>`).join('');
  $('calPower').value='6';
  for(const id of ['fillChips','tableFillChips'])$(id).addEventListener('click',e=>{const v=e.target.closest('[data-fill]')?.dataset.fill;if(v!==undefined){state.fillEV=Number(v);changed()}});
  for(const id of ['modeControl','tableModeControl'])$(id).addEventListener('click',e=>{const mode=e.target.closest('[data-mode]')?.dataset.mode;if(mode==='N'||mode==='W'){state.mode=mode;changed()}});
  $('apertureSelect').addEventListener('change',e=>{state.apertureIndex=Number(e.target.value);changed()});
  $('apertureDown').addEventListener('click',()=>{state.apertureIndex=clamp(state.apertureIndex-1,0,FSTOP_VALUES.length-1);changed()});
  $('apertureUp').addEventListener('click',()=>{state.apertureIndex=clamp(state.apertureIndex+1,0,FSTOP_VALUES.length-1);changed()});
  $('distanceSlider').addEventListener('input',e=>{state.distance=Number(e.target.value);changed()});
  $('distanceInput').addEventListener('change',e=>{const x=Number(e.target.value);if(validNumber(x,.1,10000)){state.distance=x;changed()}else{render();toast('Distance must be 0.1–10,000 m.')}});
  $('isoInput').addEventListener('change',e=>{const x=Number(e.target.value);if(validNumber(x,12,25600)){state.iso=x;changed()}else{render();toast('ISO must be between 12 and 25,600.')}});
  $('isoDown').addEventListener('click',()=>{state.iso=Math.max(12,Math.round(state.iso/2));changed()});
  $('isoUp').addEventListener('click',()=>{state.iso=Math.min(25600,state.iso*2);changed()});
  $('tableISOSelect').addEventListener('change',e=>{const iso=Number(e.target.value);if(validNumber(iso,12,25600)){state.iso=iso;changed()}});
  for(const [mode,id] of [['N','gnNInput'],['W','gnWInput']]){
    $(id).addEventListener('change',e=>{
      const gn=Number(e.target.value);
      if(validNumber(gn,.1,500)){state[mode==='N'?'gnN':'gnW']=gn;changed();}
      else{render();toast('Guide number must be 0.1–500.');}
    });
    $('apply'+mode+'GN').addEventListener('click',()=>{
      const estimate=fittedGN(state.records,mode);
      if(estimate===null)return;
      state[mode==='N'?'gnN':'gnW']=Number(estimate.toFixed(1));
      changed();
    });
  }
  for(const id of ['calMode','calISO','calDistance','calPower','calAperture','calTenths']){
    $(id).addEventListener('input',updateCalPreview);
    $(id).addEventListener('change',updateCalPreview);
  }
  $('calibrationForm').addEventListener('submit',submitCalibration);
  $('recordList').addEventListener('click',e=>{const id=e.target.closest('[data-delete]')?.dataset.delete;if(!id)return;state.records=state.records.filter(r=>r.id!==id);changed();toast('Measurement deleted')});
  $('clearRecords').addEventListener('click',()=>{if(state.records.length&&confirm(`Delete all ${state.records.length} calibration measurements?`)){state.records=[];changed();toast('All measurements cleared')}});
  $('resetSettings').addEventListener('click',()=>{if(confirm('Reset N and W guide numbers to defaults? Measurements and exposure controls will be kept.')){state.gnN=15;state.gnW=10.6;changed();toast('Guide numbers reset')}});
  $('exportData').addEventListener('click',exportData);
  $('importData').addEventListener('change',importData);
  document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>goPage(b.dataset.page)));
  $('powerTable').addEventListener('click',selectTableCell);
  render();updateCalPreview();
  if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{/* Calculator remains functional if caching is unavailable. */})}
}
function changed(){save();render()}
function writePower(id,step){const p=powerLabel(step).split(' +');$(id).replaceChildren(document.createTextNode(p[0]));if(p[1]){const sm=document.createElement('small');sm.textContent='+'+p[1];$(id).appendChild(document.createTextNode(' '));$(id).appendChild(sm)}}
function render(){
  const s=state,iso=s.iso,f=FSTOP_VALUES[s.apertureIndex];
  const result=requiredPower({gn100:activeGN(s.mode),iso,aperture:f,distance:s.distance,fillEV:s.fillEV});
  writePower('powerValue',result.step);
  $('powerDetail').textContent=`${s.mode} beam · ${fmt(s.distance)} m · ISO ${s.iso}`;
  const msg=$('powerWarning');
  const resultPanel=document.querySelector('.field-result');
  const hasWarning=result.status!=='ok';
  msg.hidden=!hasWarning;
  resultPanel.classList.toggle('has-warning',hasWarning);
  if(result.status==='too-weak')msg.textContent=`Under ${Math.log2(result.required).toFixed(1)} EV`;
  if(result.status==='too-strong')msg.textContent=`Over ${Math.log2((1/128)/result.required).toFixed(1)} EV`;
  $('flashSummary').textContent=s.fillEV===0?'Full flash':`${fmtEV(s.fillEV)} fill`;
  $('isoInput').value=String(s.iso);
  $('isoDown').disabled=s.iso<=12;
  $('isoUp').disabled=s.iso>=25600;
  $('apertureSelect').value=String(s.apertureIndex);
  $('apertureDown').disabled=s.apertureIndex===0;
  $('apertureUp').disabled=s.apertureIndex===FSTOP_VALUES.length-1;
  $('distanceSlider').value=String(clamp(s.distance,.5,10));$('distanceInput').value=String(s.distance);
  document.querySelectorAll('[data-mode]').forEach(b=>{const on=b.dataset.mode===s.mode;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on))});
  document.querySelectorAll('[data-fill]').forEach(b=>{const on=Number(b.dataset.fill)===s.fillEV;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on))});
  $('gnNInput').value=String(Number(s.gnN.toFixed(1)));
  $('gnWInput').value=String(Number(s.gnW.toFixed(1)));
  for(const mode of ['N','W']){
    const estimate=fittedGN(s.records,mode), count=s.records.filter(r=>r.mode===mode).length;
    $(mode==='N'?'normalCalSource':'wideCalSource').textContent=count?`Estimate ${fmt(estimate)} · ${count} reading${count===1?'':'s'}`:'No measurements';
    const button=$('apply'+mode+'GN');
    button.disabled=estimate===null;button.textContent=estimate===null?'Use estimate':`Use ${fmt(estimate)}`;
  }
  const selector=$('tableISOSelect');
  const isos=[...new Set([...TABLE_ISOS,s.iso])].sort((a,b)=>a-b);
  if(selector.options.length!==isos.length || isos.some((iso,i)=>Number(selector.options[i]?.value)!==iso))
    selector.replaceChildren(...isos.map(v=>{const option=document.createElement('option');option.value=String(v);option.textContent=String(v);return option;}));
  selector.value=String(s.iso);
  if($('tablePage').classList.contains('active')){
    const viewport=$('tableViewport'),x=viewport.scrollLeft,y=viewport.scrollTop;
    renderTable();viewport.scrollLeft=x;viewport.scrollTop=y;
  }
  $('recordCount').textContent=`${s.records.length} saved`;
  $('clearRecords').disabled=s.records.length===0;
  renderRecords();
}

const FULL_STOP_COLUMNS=Object.freeze([0,3,6,9,12,15,18,21,24,27]);
const distanceLabel=d=>Number.isInteger(d)?String(d):String(Number(d.toFixed(2)));
function renderTable(){
  const s=state;
  const gn=activeGN(s.mode);
  const maxRange=rangeFor({gn100:gn,iso:s.iso,aperture:FSTOP_VALUES[0],fillEV:s.fillEV,powerStep:0});
  // Always include the currently selected aperture/distance, even at 1/3 stops or beyond range.
  const columns=[...new Set([...FULL_STOP_COLUMNS,s.apertureIndex])].sort((a,b)=>a-b);
  const distances=tableDistances(maxRange,s.distance);
  $('tableRange').textContent=`Full power to ${distanceLabel(Number(maxRange.toFixed(2)))} m · f/1.4`;
  const table=$('powerTable'),head=table.tHead,body=table.tBodies[0];
  head.replaceChildren();body.replaceChildren();
  const header=document.createElement('tr');
  const corner=document.createElement('th');corner.className='distance-col corner';corner.scope='col';corner.textContent='m / f';header.append(corner);
  for(const i of columns){
    const th=document.createElement('th');th.scope='col';th.textContent=`f/${FSTOP_LABELS[i]}`;
    if(i===s.apertureIndex)th.classList.add('axis-current');
    header.append(th);
  }
  head.append(header);
  const fragment=document.createDocumentFragment();
  for(const distance of distances){
    const isCurrent=Math.abs(distance-s.distance)<1e-8;
    const row=document.createElement('tr');
    if(isCurrent)row.classList.add('row-current');
    const th=document.createElement('th');th.scope='row';th.className='distance-col';th.textContent=distanceLabel(distance);row.append(th);
    for(const index of columns){
      const p=requiredPower({gn100:gn,iso:s.iso,aperture:FSTOP_VALUES[index],distance,fillEV:s.fillEV});
      const td=document.createElement('td');
      if(index===s.apertureIndex)td.classList.add('column-current');
      if(isCurrent&&index===s.apertureIndex){td.classList.add('intersection');td.id='currentTableCell';}
      const button=document.createElement('button');button.type='button';button.className='power-cell';
      button.dataset.apertureIndex=String(index);button.dataset.distance=String(distance);
      const full=`f/${FSTOP_LABELS[index]} at ${distanceLabel(distance)} m, ISO ${s.iso}, ${s.mode} beam, ${s.fillEV} EV fill`;
      if(p.status==='ok'){
        const label=powerLabel(p.step);button.textContent=label;
        button.setAttribute('aria-label',`${full}: flash ${label}. Use this setting`);
      }else{
        const under=p.status==='too-weak';
        const delta=under?Math.log2(p.required):Math.log2((1/128)/p.required);
        const label=`${under?'Under':'Over'} ${delta.toFixed(1)}`;
        button.classList.add('out-of-range');button.textContent=label;
        button.setAttribute('aria-label',`${full}: ${label} EV. Use this setting`);
      }
      td.append(button);row.append(td);
    }
    fragment.append(row);
  }
  body.append(fragment);
}
function alignTableToCurrent(){
  const viewport=$('tableViewport');
  const target=$('currentTableCell');
  if(!target)return;
  // Keep the current intersection visible without scrolling the entire document.
  const left=target.offsetLeft,top=target.offsetTop;
  const colWidth=target.offsetWidth,rowHeight=target.offsetHeight;
  viewport.scrollLeft=Math.max(0,left-viewport.clientWidth/2+colWidth/2);
  viewport.scrollTop=Math.max(0,top-viewport.clientHeight/2+rowHeight/2);
}
function selectTableCell(e){
  const button=e.target.closest('.power-cell');if(!button)return;
  const apertureIndex=Number(button.dataset.apertureIndex);
  const distance=Number(button.dataset.distance);
  if(!Number.isInteger(apertureIndex)||apertureIndex<0||apertureIndex>=FSTOP_VALUES.length||!validNumber(distance,.1,10000))return;
  state.apertureIndex=apertureIndex;
  state.distance=distance;
  changed();
}

function renderRecords(){
  const container=$('recordList');container.replaceChildren();
  if(!state.records.length){
    const empty=document.createElement('p');empty.className='empty';empty.textContent='No measurements';container.append(empty);return;
  }
  for(const record of [...state.records].reverse()){
    const row=document.createElement('div');row.className='record';
    const title=document.createElement('strong');title.textContent=`${record.mode} · ${powerLabel(record.powerStep)} · ${fmt(record.distance)} m`;
    const details=document.createElement('small');details.textContent=`ISO ${record.iso} · f/${record.aperture} +${record.tenths}/10 · ${record.createdAt.slice(0,10)}`;
    const gn=document.createElement('em');gn.textContent=`GN ${fmt(normalizedGN(record))}`;
    const del=document.createElement('button');del.type='button';del.textContent='Delete';del.dataset.delete=record.id;del.setAttribute('aria-label','Delete measurement');
    row.append(title,details,gn,del);container.append(row);
  }
}
function measurementDraft(){
  const input=$('calAperture').value.trim();
  return {id:crypto.randomUUID(),mode:$('calMode').value,iso:Number($('calISO').value),
    distance:Number($('calDistance').value),powerStep:Number($('calPower').value),
    aperture:input===''?NaN:Number(input),tenths:Number($('calTenths').value),
    createdAt:new Date().toISOString()};
}
function updateCalPreview(){
  const reading=measurementDraft();
  $('calPreview').textContent=validateRecord(reading)?`GN ${fmt(normalizedGN(reading))}`:'—';
}
function submitCalibration(event){
  event.preventDefault();
  const reading=measurementDraft();
  if(!validateRecord(reading)){toast('Check measurement values');return}
  if(state.records.length>=1000){toast('Maximum 1,000 measurements');return}
  state.records.push(reading);changed();
  $('calAperture').value='';$('calTenths').value='0';updateCalPreview();
  toast(`Saved ${reading.mode} · GN ${fmt(normalizedGN(reading))}`);
}
function goPage(name){
  for(const el of document.querySelectorAll('.page'))el.classList.toggle('active',el.id===`${name}Page`);
  for(const b of document.querySelectorAll('[data-page]')){const selected=b.dataset.page===name;b.classList.toggle('selected',selected);if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')}
  if(name==='table'){renderTable();requestAnimationFrame(alignTableToCurrent)}
  if (document.documentElement.classList.contains('standalone-app')) {
    document.querySelector('.shell > main')?.scrollTo({top:0,behavior:'instant'});
  } else {
    window.scrollTo({top:0,behavior:'instant'});
  }
}
function exportData(){
  const data={application:'flash-meter-it30pro',version:2,exportedAt:new Date().toISOString(),state};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`godox-flash-calibration-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('JSON backup exported');
}
async function importData(e){
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  if(file.size>1024*1024){toast('Backup file too large.');return}
  try{const data=JSON.parse(await file.text());if(data.application!=='flash-meter-it30pro'||![1,2].includes(data.version)||!data.state||!Array.isArray(data.state.records))throw Error('Invalid backup format');
    if(!confirm(`Import backup, replacing active guide numbers and ${state.records.length} saved measurement(s)?`))return;
    state=validateState(data.state);changed();toast(`Imported ${state.records.length} measurements`);
  }catch{toast('Cannot import: invalid JSON backup.')}}
init();