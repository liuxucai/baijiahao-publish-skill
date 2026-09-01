// cover_sel.js — 点击 AI封图 tab 生成后，点选缩略图以启用确定，再点确定收尾
const cdpLib = require('./cdp_lib.js');
const path = require('path');
const OUT = 'C:\\Users\\菠萝\\.qclaw\\baijiahao_skill';
const CDP_PORT = 9222;
function log(m){console.log('['+new Date().toLocaleTimeString()+'] '+m);}
function sl(ms){return new Promise(r=>setTimeout(r,ms));}
async function shot(sock,name){log('截图 '+name+': '+await cdpLib.cdpShot(sock,path.join(OUT,name)));}
async function clickEl(sock,finderExpr){
  const rc=await cdpLib.cdpEval(sock,"(function(){try{var e=("+finderExpr+");if(!e||e.offsetWidth===0)return 'NF';if(e.scrollIntoView)e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}catch(ex){return 'ERR';}})()");
  if(typeof rc==='string'&&rc.indexOf('{')===0){const p=JSON.parse(rc);await cdpLib.cdpClickXY(sock,p.x,p.y);await sl(900);return true;}
  log('  clickEl 未命中: '+rc);return false;
}
const COVER_FINDER = "(function(){var els=Array.from(document.querySelectorAll('*'));var cand=els.filter(function(e){return (e.textContent||'').trim()==='选择封面'&&e.getBoundingClientRect().width>100&&e.getBoundingClientRect().width<400;});if(!cand.length)return null;cand.sort(function(a,b){return a.getBoundingClientRect().width-b.getBoundingClientRect().width;});return cand[0];})()";
const COVER_MODAL = "Array.from(document.querySelectorAll('[role=dialog]')).find(function(d){return d.innerText.indexOf('AI封图')!==-1||d.innerText.indexOf('本地上传')!==-1;})";
async function dumps(sock){const d=await cdpLib.cdpEval(sock,"(function(){var c=("+COVER_MODAL+");if(!c)return 'NO_MODAL';var b=Array.from(c.querySelectorAll('button')).map(function(x){return {t:(x.textContent||'').trim().substring(0,10),dis:x.disabled,ay:Math.round(x.getBoundingClientRect().y),ax:Math.round(x.getBoundingClientRect().x)};});var sel=Array.from(c.querySelectorAll('img')).map(function(i){var cs=getComputedStyle(i);var r=i.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),sel:cs.outlineColor||cs.borderColor,ay:Math.round(r.y)};}).filter(function(i){return i.w>40;});return JSON.stringify({buttons:b,imgs:sel});})()");log('弹窗: '+d);}
async function main(){
  const sock=await cdpLib.cdpConnect(CDP_PORT);
  if(!sock){log('❌ CDP');return;}
  await sl(2500);
  // 关可能已开的弹窗
  await cdpLib.cdpEval(sock,"(function(){var c=("+COVER_MODAL+");if(c){var b=Array.from(c.querySelectorAll('button')).find(function(x){return x.textContent.indexOf('取消')!==-1;});if(b)b.click();}})()");
  await sl(1500);
  await cdpLib.cdpEval(sock,'window.scrollTo(0,0)');await sl(400);
  await cdpLib.cdpEval(sock,'window.scrollTo(0,1400)');await sl(2200);
  log('点开封面弹窗');
  if(!await clickEl(sock,COVER_FINDER)){log('未找到占位');return;}
  await sl(2500);
  log('切 AI封图 tab');
  await clickEl(sock,"Array.from(("+COVER_MODAL+").querySelectorAll('[role=tab]')).find(function(t){return t.textContent.indexOf('AI封图')!==-1;})");
  await sl(6000);
  await dumps(sock); await shot(sock,'s1_gen.png');
  // 点第一张缩略图
  log('点击第一张缩略图');
  await clickEl(sock,"(function(){var c=("+COVER_MODAL+");var imgs=Array.from(c.querySelectorAll('img')).filter(function(i){return i.getBoundingClientRect().width>40;});return imgs[0]||null;})()");
  await sl(2500);
  await dumps(sock); await shot(sock,'s2_pick.png');
  // 若 确定 仍 disabled，再尝试点第2、3张
  let dis=await cdpLib.cdpEval(sock,"(function(){var c=("+COVER_MODAL+");var b=Array.from(c.querySelectorAll('button')).find(function(x){return x.textContent.indexOf('确定')!==-1;});return b?b.disabled:null;})()");
  log('点图后 确定 disabled='+dis);
  if(dis){for(let k=2;k<6;k++){log('  retry 点第'+k+'张');await clickEl(sock,"(function(){var c=("+COVER_MODAL+");var imgs=Array.from(c.querySelectorAll('img')).filter(function(i){return i.getBoundingClientRect().width>40;});return imgs["+k+"]||null;})()");await sl(2000);var d2=await cdpLib.cdpEval(sock,"(function(){var c=("+COVER_MODAL+");var b=Array.from(c.querySelectorAll('button')).find(function(x){return x.textContent.indexOf('确定')!==-1;});return b?b.disabled:null;})()");log('    确定 disabled='+d2);if(!d2)break;}}
  await dumps(sock); await shot(sock,'s3_final.png');
  // 点确定
  const okClick=await clickEl(sock,"Array.from(("+COVER_MODAL+").querySelectorAll('button')).find(function(x){return x.textContent.indexOf('确定')!==-1&&x.offsetWidth>0;})");
  await sl(4000);
  const st=await cdpLib.cdpEval(sock,"(function(){var els=Array.from(document.querySelectorAll('*'));var hasPlaceholder=els.some(function(e){return (e.textContent||'').trim()==='选择封面';});var imgs=Array.from(document.querySelectorAll('img')).filter(function(i){return i.offsetWidth>60&&i.offsetHeight>40;});return JSON.stringify({hasPlaceholder:hasPlaceholder,imgs:imgs.length});})()");
  log('点确定后封面状态: '+st);
  await shot(sock,'s4_applied.png');
  sock.close();
}
main().catch(e=>log('FATAL: '+e.message));
