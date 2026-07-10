// bjh_cover3.js — 正确版本：cheetah/FeEditorApp 结构
// 流程: 开弹窗 -> 隐藏提示条 -> 切AI封图 -> CDP点提示词框 -> insertText -> CDP点生成按钮(1153,274) -> 轮询确定 -> 点确定(1388,752)
var exec=require('child_process').execFileSync;
var fs=require('fs');
var path=require('path');
var cdpLib=require('./cdp_lib.js');
var HOME=process.env.USERPROFILE;
var XB=path.join(HOME,'.qclaw','skills','xbrowser','scripts','xb.cjs');
var SAVE=path.join(HOME,'.qclaw','workspace-agent-3af8d089')+'\\';
var COVER_JPG=path.join(HOME,'.qclaw','workspace-agent-3af8d089','cover.jpg');
function b64(js){return Buffer.from(js).toString('base64')}
function xbEval(js){
  try{var r=exec('node',[XB,'run','--browser','chrome','eval','--base64',b64(js)],{encoding:'utf8',timeout:15000});try{return JSON.parse(r).data?.result?.data?.result||'NF'}catch(e){return (r||'NF').toString().substring(0,200)}}catch(e){return 'EX:'+e.message.substring(0,60)}
}
function xbSnap(){
  try{var r=exec('node',[XB,'run','--browser','chrome','snapshot','-i'],{encoding:'utf8',timeout:15000});return JSON.parse(r).data?.result?.data?.snapshot||''}catch(e){return ''}
}
function scr(n){try{exec('node',[XB,'run','--browser','chrome','screenshot',SAVE+'bc3_'+n+'.png'],{encoding:'utf8',timeout:10000})}catch(e){}}
function log(m){console.log('['+new Date().toLocaleTimeString()+'] '+m)}
function sl(ms){return new Promise(function(r){setTimeout(r,ms);});}
async function cdpClickXY(sock,x,y){
  await cdpLib.cdp(sock,'Input.dispatchMouseEvent',{type:'mouseMoved',x:x,y:y,button:'left',buttons:0});
  await cdpLib.cdp(sock,'Input.dispatchMouseEvent',{type:'mousePressed',x:x,y:y,button:'left',buttons:1,clickCount:1});
  await cdpLib.cdp(sock,'Input.dispatchMouseEvent',{type:'mouseReleased',x:x,y:y,button:'left',buttons:0,clickCount:1});
}
async function openCover(sock){
  await cdpLib.cdpEval(sock,'window.scrollTo(0,0)');await sl(400);
  await cdpLib.cdpEval(sock,'window.scrollTo(0,1200)');await sl(2200);
  await cdpClickXY(sock,612,561);
  await sl(3000);
  return xbSnap().indexOf('本地上传')!==-1;
}
async function hideTipBar(sock){
  await cdpLib.cdpEval(sock,"(function(){var nodes=Array.from(document.querySelectorAll('*'));for(var i=0;i<nodes.length;i++){var e=nodes[i];if(e.children.length===0&&e.textContent.indexOf('标题功能已合并至文字模板')!==-1){var bar=e.closest('[class*=notice],[class*=tip],[class*=alert],[class*=bar],[class*=banner]')||e.parentElement;if(bar){bar.style.display='none';return 'HIDDEN'}} }return 'NF';})()");
  await sl(700);
}
async function clickTabByText(sock,txt){
  var pos=await cdpLib.cdpEval(sock,"(function(){var tabs=document.querySelectorAll('[role=tab]');for(var i=0;i<tabs.length;i++){if(tabs[i].textContent.indexOf('"+txt+"')!==-1){var r=tabs[i].getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}}return 'NF';})()");
  if(!pos||pos==='NF')return false;
  var p=JSON.parse(pos);
  await cdpClickXY(sock,p.x,p.y);
  await sl(2200);
  var sel=await cdpLib.cdpEval(sock,"(function(){var t=document.querySelectorAll('[role=tab]');for(var i=0;i<t.length;i++){if(t[i].getAttribute('aria-selected')==='true')return t[i].textContent.trim();}return 'none';})()");
  return sel===txt;
}
function confirmEnabled(){
  return xbEval("(function(){var b=document.querySelectorAll('button');for(var i=0;i<b.length;i++){if(b[i].textContent.trim()==='确定'){return b[i].disabled?'DISABLED':'ENABLED'}}return 'NF'})()");
}
async function main(){
  log('=== 封面流程 v3 (cheetah结构) ===');
  var sock=await cdpLib.cdpConnect(9222);
  if(!sock){log('❌ CDP');return;}
  var opened=await openCover(sock);
  if(!opened){opened=await openCover(sock);}
  log('弹窗: '+opened);
  if(!opened){scr('no_modal');sock.close();return;}
  await hideTipBar(sock);
  var aiOk=await clickTabByText(sock,'AI封图');
  log('AI封图: '+aiOk);
  if(!aiOk){scr('no_ai_tab');sock.close();return;}
  scr('ai_tab');

  // 点提示词 textarea (853,228) 并插入文本
  await cdpClickXY(sock,853,228);
  await sl(600);
  await cdpLib.cdpInsertText(sock,'根据全文智能生成一张新闻风格封面');
  await sl(1000);
  var taVal=await cdpLib.cdpEval(sock,"(function(){var tas=Array.from(document.querySelectorAll('textarea'));var ta=tas.find(function(t){var r=t.getBoundingClientRect();return r.width>300&&r.height>40&&r.top>150&&r.top<320;});return ta?(ta.value||'').length:'NO_TA';})()");
  log('提示词字数: '+taVal);

  // 点生成按钮 (1153,274)
  await cdpClickXY(sock,1153,274);
  log('已点生成按钮，轮询...');
  var done=false;
  for(var i=0;i<24;i++){
    await sl(5000);
    var d=await confirmEnabled();
    if(i%3===0||d==='ENABLED')log('  ['+((i+1)*5)+'s] 确定: '+d);
    if(d==='ENABLED'){done=true;break;}
    if(i===8)scr('gen_mid');
  }
  log('生成完成: '+done);
  scr('gen_done');
  if(done){
    await cdpClickXY(sock,1388,752);
    await sl(3000);
    scr('confirmed');
    var s2=xbSnap();
    log('✅ 封面已设置(选择封面消失): '+(s2.indexOf('选择封面')===-1));
    sock.close();
    return;
  }
  // 兜底：本地上传
  log('⚠️ AI生成未果，转本地上传');
  await clickTabByText(sock,'本地上传');
  await sl(1500);
  var setRes=await cdpLib.setFileInputFiles(sock,COVER_JPG);
  log('文件注入: '+setRes);
  await sl(3000);scr('uploaded');
  var d2=await confirmEnabled();
  log('确定: '+d2);
  if(d2==='ENABLED'){await cdpClickXY(sock,1388,752);await sl(3000);scr('confirmed2');log('✅ 封面已设置(本地)');}
  else{scr('fail');log('⚠️ 本地上传未生效');}
  sock.close();
}
main().catch(function(e){log('FATAL: '+e.message);});
