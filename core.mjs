/* Portable, dependency-free exposure model. GN units: metres, ISO 100, full power. */
export const DEFAULT_GN = 15;
export const MIN_POWER_STEP = 21; // 1/128, steps of one third EV from full
export const FSTOP_LABELS = ['1.4','1.6','1.8','2','2.2','2.5','2.8','3.2','3.5','4','4.5','5','5.6','6.3','7.1','8','9','10','11','13','14','16','18','20','22','25','29','32'];
export const FSTOP_VALUES = FSTOP_LABELS.map((_,i)=>Math.pow(2, 0.5 + i/6));
export const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
export const powerFraction=(step)=>Math.pow(2,-step/3);
export function powerLabel(step){
  const s=clamp(Math.round(step),0,MIN_POWER_STEP);
  const base=Math.ceil(s/3);
  const delta=base*3-s;
  const denom=Math.pow(2,base);
  return `1/${denom}${delta ? ` +${(delta/3).toFixed(1)}`:''}`;
}
export function effectiveGN(gn100,iso,powerStep=0){return gn100*Math.sqrt(iso/100)*Math.sqrt(powerFraction(powerStep));}
export function requiredPower({gn100,iso,aperture,distance,fillEV=0}){
  const targetFraction=Math.pow(2,fillEV);
  const required=(aperture*distance/(gn100*Math.sqrt(iso/100)))**2*targetFraction;
  const rawStep=-3*Math.log2(required);
  const step=clamp(Math.round(rawStep),0,MIN_POWER_STEP);
  const actual=powerFraction(step);
  return {required,rawStep,step,actual,deltaEV:Math.log2(actual/required),
    status:required>1+1e-9?'too-weak':required<1/128-1e-9?'too-strong':'ok'};
}
export function rangeFor({gn100,iso,aperture,fillEV=0,powerStep=0}){
  return effectiveGN(gn100,iso,powerStep)/(aperture*Math.sqrt(Math.pow(2,fillEV)));
}
export function normalizedGN({distance,iso,aperture,tenths=0,powerStep=0}){
  const actualAperture=aperture*Math.pow(2,tenths/20); // tenths of EV -> f-number
  return actualAperture*distance/Math.sqrt(iso/100)/Math.sqrt(powerFraction(powerStep));
}
export function median(values){if(!values.length) return null; const v=[...values].sort((a,b)=>a-b);return v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2;}
export function fittedGN(records,mode){
  const v=records.filter(r=>r.mode===mode).map(normalizedGN).filter(x=>Number.isFinite(x)&&x>0);
  // Median in log exposure space: one observation with a large deviation cannot dominate.
  const logMedian=median(v.map(x=>Math.log2(x)));
  return logMedian===null?null:Math.pow(2,logMedian);
}
export function resolveGN(records,mode,baseGN=DEFAULT_GN,wideLossEV=1){
  const measured=fittedGN(records,mode);
  if(measured!==null)return {gn:measured,source:'measured',samples:records.filter(r=>r.mode===mode).length};
  const nCal=fittedGN(records,'N');
  const gnN=nCal??baseGN;
  if(mode==='N')return {gn:gnN,source:nCal===null?'manufacturer':'measured',samples:records.filter(r=>r.mode==='N').length};
  return {gn:gnN*Math.pow(2,-wideLossEV/2),source:nCal===null?'provisional':'derived',samples:0};
}