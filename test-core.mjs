import test from 'node:test';
import assert from 'node:assert/strict';
import {powerLabel,powerFraction,requiredPower,rangeFor,normalizedGN,fittedGN,resolveGN} from './core.mjs';
const near=(actual,expected,epsilon=1e-9)=>assert.ok(Math.abs(actual-expected)<epsilon,`${actual} != ${expected}`);
test('manual Godox 1/3 EV power labels',()=>{
  assert.equal(powerLabel(0),'1/1');assert.equal(powerLabel(1),'1/2 +0.7');assert.equal(powerLabel(2),'1/2 +0.3');assert.equal(powerLabel(3),'1/2');assert.equal(powerLabel(9),'1/8');assert.equal(powerLabel(21),'1/128');
  near(powerFraction(6),1/4);
});
test('ISO/distance/aperture math and fill',()=>{
  const full=requiredPower({gn100:15,iso:400,aperture:7.5,distance:2,fillEV:0});
  near(full.required,1/4);assert.equal(full.step,6);
  const fill=requiredPower({gn100:15,iso:400,aperture:7.5,distance:2,fillEV:-2});
  near(fill.required,1/16);assert.equal(fill.step,12);
  near(rangeFor({gn100:15,iso:400,aperture:7.5,fillEV:0,powerStep:0}),4);
});
test('out-of-range detection',()=>{
  assert.equal(requiredPower({gn100:15,iso:100,aperture:22,distance:10}).status,'too-weak');
  assert.equal(requiredPower({gn100:15,iso:6400,aperture:1.4,distance:.5,fillEV:-4}).status,'too-strong');
});
test('Sekonic calibration normalization',()=>{
  near(normalizedGN({distance:2,iso:400,aperture:7.5,tenths:0,powerStep:0}),7.5);
  near(normalizedGN({distance:2,iso:100,aperture:8,tenths:3,powerStep:0}),16*Math.pow(2,.15));
  const samples=[{mode:'N',distance:1,iso:100,aperture:15,tenths:0,powerStep:0},{mode:'N',distance:2,iso:100,aperture:7.5,tenths:0,powerStep:0},{mode:'N',distance:1,iso:100,aperture:90,tenths:0,powerStep:0}];
  near(fittedGN(samples,'N'),15);near(resolveGN(samples,'W',15,1).gn,15/Math.sqrt(2));
});
