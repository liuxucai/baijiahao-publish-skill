// cover_diag.js — 诊断当前编辑器封面状态
const cdpLib = require('./cdp_lib.js');
const fs = require('fs');
const path = require('path');
const OUT = 'C:\\Users\\菠萝\\.qclaw\\baijiahao_skill';
const CDP_PORT = 9222;
function log(m){console.log('['+new Date().toLocaleTimeString()+'] '+m);}
function sl(ms){return new Promise(r=>setTimeout(r,ms));}
async function shot(sock,name){const p=path.join(OUT,name);log('截图 '+name+': '+await cdpLib.cdpShot(sock,p));return p;}

async function main(){
  const sock=await cdpLib.cdpConnect(CDP_PORT);
  if(!sock){log('❌ CDP');return;}
  await sl(2500);
  const url=await cdpLib.cdpEval(sock,'location.href');
  log('URL: '+url);
  // 登录态
  const login=await cdpLib.cdpEval(sock,"(function(){return document.body.innerText.indexOf('登录')!==-1?'NEED_LOGIN':'LOGGED_IN';})()");
  log('登录态: '+login);
  // 封面占位是否存在（未设封面的标志）
  const coverState=await cdpLib.cdpEval(sock,"(function(){var els=Array.from(document.querySelectorAll('*'));var hasPlaceholder=els.some(function(e){return (e.textContent||'').trim()==='选择封面';});var imgs=Array.from(document.querySelectorAll('img')).filter(function(i){return i.src&&i.src.indexOf('data:')===0&&i.offsetWidth>60;});return JSON.stringify({hasPlaceholder:hasPlaceholder,bigImgs:imgs.length});})()");
  log('封面状态: '+coverState);
  // 是否有封面选择弹窗开着
  const dlg=await cdpLib.cdpEval(sock,"(function(){var ds=Array.from(document.querySelectorAll('[role=dialog]'));return ds.map(function(d){return (d.innerText||'').replace(/\\s+/g,' ').substring(0,30);});})()");
  log('dialog 数: '+(dlg?dlg.length:0));
  (dlg||[]).forEach((t,i)=>log('  dlg['+i+']: '+t));
  // 标题/正文
  const title=await cdpLib.cdpEval(sock,"(function(){var e=document.querySelector('[data-testid=news-title-input] [contenteditable=true]')||document.querySelector('.title-input__inner');return e?(e.innerText||'').substring(0,40):'NO_TITLE';})()");
  log('标题: '+title);
  await shot(sock,'cover_diag.png');
  sock.close();
}
main().catch(e=>log('FATAL: '+e.message));
