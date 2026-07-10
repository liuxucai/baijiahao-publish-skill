// bjh_publish3.js — 填标题+正文校验+原生click发布+处理弹窗
var exec=require('child_process').execFileSync;
var fs=require('fs');
var path=require('path');
var cdpLib=require('./cdp_lib.js');
var HOME=process.env.USERPROFILE;
var XB=path.join(HOME,'.qclaw','skills','xbrowser','scripts','xb.cjs');
var SAVE=path.join(HOME,'.qclaw','workspace-agent-3af8d089')+'\\';
var TITLE='京东外卖强势入局';
function b64(js){return Buffer.from(js).toString('base64')}
function xbEval(js){
  try{var r=exec('node',[XB,'run','--browser','chrome','eval','--base64',b64(js)],{encoding:'utf8',timeout:15000});try{return JSON.parse(r).data?.result?.data?.result||'NF'}catch(e){return (r||'NF').toString().substring(0,200)}}catch(e){return 'EX:'+e.message.substring(0,60)}
}
function xbSnap(){
  try{var r=exec('node',[XB,'run','--browser','chrome','snapshot','-i'],{encoding:'utf8',timeout:15000});return JSON.parse(r).data?.result?.data?.snapshot||''}catch(e){return ''}
}
function scr(n){try{exec('node',[XB,'run','--browser','chrome','screenshot',SAVE+'pub3_'+n+'.png'],{encoding:'utf8',timeout:10000})}catch(e){}}
function log(m){console.log('['+new Date().toLocaleTimeString()+'] '+m)}
function sl(ms){return new Promise(function(r){setTimeout(r,ms);});}
async function cdpClickXY(sock,x,y){
  await cdpLib.cdp(sock,'Input.dispatchMouseEvent',{type:'mouseMoved',x:x,y:y,button:'left',buttons:0});
  await cdpLib.cdp(sock,'Input.dispatchMouseEvent',{type:'mousePressed',x:x,y:y,button:'left',buttons:1,clickCount:1});
  await cdpLib.cdp(sock,'Input.dispatchMouseEvent',{type:'mouseReleased',x:x,y:y,button:'left',buttons:0,clickCount:1});
}
async function main(){
  log('=== 发布 v3 (填标题+原生click) ===');
  var sock=await cdpLib.cdpConnect(9222);
  if(!sock){log('❌ CDP');return;}

  await cdpLib.cdpEval(sock,'window.scrollTo(0,0)');await sl(500);
  // 填标题
  var tpos=await cdpLib.cdpEval(sock,"(function(){var e=document.querySelector('[data-testid=news-title-input]')||document.querySelector('.title-input__inner')||document.querySelector('.input-box');if(!e)return 'NO_EL';var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()");
  var tp=JSON.parse(tpos);
  await cdpClickXY(sock,tp.x,tp.y);await sl(400);
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Control',code:'ControlLeft',modifiers:2});
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',modifiers:2});
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyUp',key:'a',code:'KeyA',modifiers:2});
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyUp',key:'Control',code:'ControlLeft',modifiers:0});
  await sl(300);
  await cdpLib.cdpInsertText(sock,TITLE);
  await sl(800);
  var tnow=await cdpLib.cdpEval(sock,"(function(){var e=document.querySelector('[data-testid=news-title-input]')||document.querySelector('.title-input__inner')||document.querySelector('.input-box');return e?(e.innerText||'').substring(0,30):'NO_EL';})()");
  log('标题: '+tnow);
  var bodyLen=await cdpLib.cdpEval(sock,"(function(){return (typeof editor!=='undefined'&&editor.getContent)?editor.getContent().length:0;})()");
  log('正文: '+bodyLen+'字');

  // 原生 click 发布
  var r=await cdpLib.cdpEval(sock,"(function(){var b=Array.from(document.querySelectorAll('button'));for(var i=0;i<b.length;i++){if(b[i].textContent.trim()==='发布'&&b[i].offsetWidth>0){b[i].click();return 'CLICKED';}}return 'NF';})()");
  log('发布: '+r);
  await sl(3500);
  scr('after_pub');

  var body=await new Promise(function(res){res(xbEval('document.body.innerText'));});
  log('弹窗: 确认发布='+(body.indexOf('确认发布')!==-1)+' 原创声明='+(body.indexOf('原创声明')!==-1)+' 发布成功='+(body.indexOf('发布成功')!==-1)+' 审核='+(body.indexOf('审核')!==-1));
  if(body.indexOf('确认发布')!==-1||body.indexOf('原创声明')!==-1){
    scr('dialog');
    await cdpLib.cdpEval(sock,"(function(){var b=Array.from(document.querySelectorAll('button'));for(var i=0;i<b.length;i++){if((b[i].textContent.trim().indexOf('确认发布')!==-1||b[i].textContent.trim()==='确定')&&b[i].offsetWidth>0){b[i].click();return 'CLICKED';}}return 'NF';})()");
    await sl(3000);
    scr('after_confirm');
  }

  var published=false;
  for(var i=0;i<12;i++){
    await sl(3000);
    var url=await cdpLib.cdpEval(sock,'location.href');
    var snap=xbSnap();
    var ok=snap.indexOf('发布成功')!==-1||snap.indexOf('审核中')!==-1||snap.indexOf('已发布')!==-1||snap.indexOf('已提交')!==-1||url.indexOf('manage')!==-1||url.indexOf('success')!==-1||url.indexOf('articleId')!==-1;
    log('  ['+((i+1)*3)+'s] url='+url.substring(0,55)+' ok='+ok);
    if(ok){published=true;break;}
    if(i===4)scr('poll_mid');
  }
  scr('final');
  log(published?'✅ 文章已发布/提交':'⚠️ 未检测到成功信号，需人工确认');
  sock.close();
}
main().catch(function(e){log('FATAL: '+e.message);});
