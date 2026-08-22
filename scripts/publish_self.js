// publish_self.js — 自包含百家号发布（仅依赖 cdp_lib.js + ws，不依赖 xbrowser）
// 用法: 改 CONFIG(title / bodyHtml) 后 node publish_self.js
const path = require('path');
const cdpLib = require('./cdp_lib.js');
const CDP_PORT = 9222;
const EDIT_URL = 'https://baijiahao.baidu.com/builder/rc/edit?type=news';
function log(m){console.log('['+new Date().toLocaleTimeString()+'] '+m);}
function sl(ms){return new Promise(r=>setTimeout(r,ms));}

// ===================== 配置区（本次发布） =====================
const CONFIG = {
  title: '身处低谷时，请重新认识你的「处境」',
  bodyHtml: [
    '<p>人这一辈子，很少是“凭空”活着——我们总是在一个具体的处境里活着：当下的收入、身边的人、手头的事、身体的状态，乃至时代给出的机会与限制。所谓处境，就是此刻把你“框住”的全部条件的总和。</p>',
    '<p>很多人对处境的第一反应，是抗拒。觉得“我不该在这个位置”“我值得更好的安排”。这种情绪再正常不过，但它容易把人困住：你越是想立刻跳出处境，就越容易忽视处境里真正可利用的东西。</p>',
    '<p>其实处境有两层。一层是外在的：环境、资源、他人、运气，这些大多不在你当下完全掌控之中。另一层是内在的：你如何解释眼前这一切，你把它看作“绝境”还是“素材”，你选择躺着认命还是试着挪一步。外在的处境往往难改，内在的那一层，却始终握在你自己手里。</p>',
    '<p>与处境和解，不是认输。它分三步。第一步，老老实实承认“我现在就在这儿”——不美化，也不灾难化。第二步，把处境拆开看：哪些是真的动不了，哪些其实还能动。大多数人焦虑，是因为把“暂时动不了”误当成了“永远动不了”。第三步，在能动的地方，先挪一小步。处境很少被一次性推翻，却会被一连串小步悄悄改写。</p>',
    '<p>还要避开一个陷阱：拿别人的处境当尺子量自己。你看见的是别人的高光，看不见的是别人的代价与运气。别人的处境是别人的，你的处境才是你唯一能下棋的棋盘。在别人的棋盘上较劲，只会把自己的棋下乱。</p>',
    '<p>处境是会变的。今天框住你的那堵墙，过三年可能早就不在了；而你现在对待处境的方式——是抱怨、是等待、还是动手，会沉淀成你真正的“处境能力”。这种能力，比任何一次好运都耐用。</p>',
    '<p>所以，别急着逃离你的处境。先把它看清楚，在能动的边界里认真走几步。等你回头，往往会发现：正是那段不情愿的处境，把你磨成了后来那个更稳的自己。</p>',
  ].join(''),
};
// ====================================================================

// ---- 元素查找器（动态，不依赖 class hash）----
const COVER_FINDER = "(function(){var els=Array.from(document.querySelectorAll('*'));var cand=els.filter(function(e){return (e.textContent||'').trim()==='选择封面'&&e.getBoundingClientRect().width>100&&e.getBoundingClientRect().width<400;});if(!cand.length)return null;cand.sort(function(a,b){return a.getBoundingClientRect().width-b.getBoundingClientRect().width;});return cand[0];})()";
const COVER_MODAL = "Array.from(document.querySelectorAll('[role=dialog]')).find(function(d){return d.innerText.indexOf('AI封图')!==-1||d.innerText.indexOf('本地上传')!==-1;})";
function byText(tag,txt,exact){const pred=exact?"e.textContent.trim()==='"+txt+"'":"e.textContent.indexOf('"+txt+"')!==-1";return "Array.from(document.querySelectorAll('"+tag+"')).find(function(e){return "+pred+"&&e.offsetWidth>0;})";}
function inCtx(ctxExpr,tag,txt,exact){const pred=exact?"e.textContent.trim()==='"+txt+"'":"e.textContent.indexOf('"+txt+"')!==-1";return "(function(){var c=("+ctxExpr+");if(!c)return null;return Array.from(c.querySelectorAll('"+tag+"')).find(function(e){return "+pred+"&&e.offsetWidth>0;});})()";}

async function clickEl(sock,finderExpr){
  const rc=await cdpLib.cdpEval(sock,"(function(){try{var e=("+finderExpr+");if(!e||e.offsetWidth===0)return 'NF';e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}catch(ex){return 'ERR:'+ex.message;}})()");
  if(typeof rc==='string'&&rc.indexOf('{')===0){const p=JSON.parse(rc);await cdpLib.cdpClickXY(sock,p.x,p.y);await sl(900);return true;}
  log('  clickEl 未命中: '+rc);
  return false;
}
async function pageText(sock){return (await cdpLib.cdpEval(sock,'(document.body.innerText||"").replace(/\\s+/g," ")'))||'';}

async function fillTitle(sock){
  const finder="document.querySelector('[data-testid=news-title-input]')||document.querySelector('.title-input__inner')||document.querySelector('.input-box')";
  const rc=await cdpLib.cdpEval(sock,"(function(){var e=("+finder+");if(!e)return 'NO_EL';var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()");
  if(rc==='NO_EL'){log('❌ 找不到标题输入框');return false;}
  const tp=JSON.parse(rc);
  await cdpLib.cdpClickXY(sock,tp.x,tp.y);await sl(400);
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Control',code:'ControlLeft',modifiers:2});
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',modifiers:2});
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyUp',key:'a',code:'KeyA',modifiers:2});
  await cdpLib.cdp(sock,'Input.dispatchKeyEvent',{type:'rawKeyUp',key:'Control',code:'ControlLeft',modifiers:0});
  await sl(300);
  await cdpLib.cdpInsertText(sock,CONFIG.title);
  await sl(800);
  const tnow=await cdpLib.cdpEval(sock,"(function(){var e=("+finder+");return e?(e.innerText||e.value||'').substring(0,40):'NO_EL';})()");
  log('标题已填: '+tnow+'（'+CONFIG.title.length+'字）');
  return true;
}

async function setCoverAI(sock){
  await cdpLib.cdpEval(sock,'window.scrollTo(0,0)');await sl(400);
  await cdpLib.cdpEval(sock,'window.scrollTo(0,1400)');await sl(2200);
  log('点开封面弹窗...');
  if(!await clickEl(sock,COVER_FINDER)){log('⚠️ 未找到封面占位');return false;}
  await sl(2500);
  const dlg=await cdpLib.cdpEval(sock,"(function(){var ds=Array.from(document.querySelectorAll('[role=dialog]'));var c=ds.find(function(d){return d.innerText.indexOf('AI封图')!==-1||d.innerText.indexOf('本地上传')!==-1;});return c?'COVER_DLG':'OTHER';})()");
  if(dlg!=='COVER_DLG'){log('⚠️ 封面弹窗未正确打开');return false;}
  log('封面弹窗已打开');
  // 隐藏蓝色提示条
  await cdpLib.cdpEval(sock,"(function(){var n=Array.from(document.querySelectorAll('*'));for(var i=0;i<n.length;i++){var e=n[i];if(e.children.length===0&&e.textContent.indexOf('标题功能已合并至文字模板')!==-1){var bar=e.closest('[class*=notice],[class*=tip],[class*=alert],[class*=bar],[class*=banner]')||e.parentElement;if(bar){bar.style.display='none';return 'HIDDEN';}}}return 'NF';})()");
  await sl(600);
  // 切 AI封图 tab
  log('切 AI封图 tab...');
  await clickEl(sock,inCtx(COVER_MODAL,'[role=tab]','AI封图',false));
  await sl(2200);
  // 触发 AI 生成（span 文字按钮）
  log('触发 AI 生成...');
  if(!await clickEl(sock,inCtx(COVER_MODAL,'span','根据全文智能生成封面',false))){
    await clickEl(sock,inCtx(COVER_MODAL,'button','智能生成',false));
  }
  let ok=false;
  for(let i=0;i<30;i++){
    await sl(4000);
    const d=await cdpLib.cdpEval(sock,"(function(){var c=("+COVER_MODAL+");if(!c)return 'NOMODAL';var b=Array.from(c.querySelectorAll('button'));for(var i=0;i<b.length;i++){if(b[i].textContent.indexOf('确定')!==-1)return b[i].disabled?'DISABLED':'ENABLED';}return 'NF';})()");
    if(i%3===0||d==='ENABLED')log('  ['+((i+1)*4)+'s] 确定: '+d);
    if(d==='ENABLED'){ok=true;break;}
  }
  if(!ok){log('⚠️ AI 生成未就绪');return false;}
  await clickEl(sock,inCtx(COVER_MODAL,'button','确定',false));
  await sl(3000);
  log('✅ AI封面已设置');
  return true;
}

async function publish(sock){
  if(!await clickEl(sock,byText('button','发布',true))){log('未找到发布按钮');return false;}
  await sl(3500);
  let body=await pageText(sock);
  if(body.indexOf('确认发布')!==-1||body.indexOf('原创声明')!==-1){
    log('出现确认对话框，点确认发布');
    await clickEl(sock,byText('button','确认发布',false));
    await sl(3000);
  }
  for(let i=0;i<12;i++){
    await sl(3000);
    const u=await cdpLib.cdpEval(sock,'location.href');
    const s=await pageText(sock);
    const done=(s&&(s.indexOf('发布成功')!==-1||s.indexOf('审核中')!==-1||s.indexOf('已发布')!==-1||s.indexOf('已提交')!==-1))||u.indexOf('manage')!==-1||u.indexOf('success')!==-1||u.indexOf('articleId')!==-1;
    log('  ['+((i+1)*3)+'s] url='+u.substring(0,55)+' ok='+done);
    if(done)return true;
  }
  return false;
}

async function main(){
  log('=== 百家号自包含发布 ===');
  const sock=await cdpLib.cdpConnect(CDP_PORT);
  if(!sock){log('❌ CDP 连接失败');return;}
  await sl(3000);
  // 重新打开干净的编辑页（文章已存在草稿中，避免遗留 dialog 干扰）
  await cdpLib.cdp(sock,'Page.navigate',{url:EDIT_URL+'&t='+Date.now()});
  await sl(9000);
  // 等编辑器 ready
  for(let i=0;i<40;i++){const v=await cdpLib.cdpEval(sock,"(function(){return (typeof editor!=='undefined'&&editor.setContent)?'READY':'WAIT';})()");if(v==='READY')break;await sl(1500);}
  // 关引导弹窗
  await cdpLib.cdpEval(sock,"(function(){var b=Array.from(document.querySelectorAll('button'));for(var i=0;i<b.length;i++){if(b[i].textContent.trim().indexOf('我知道了')!==-1&&b[i].offsetWidth>0){b[i].click();return 'CLOSED';}}return 'NONE';})()");
  await sl(800);
  await fillTitle(sock);
  const r=await cdpLib.cdpEval(sock,"(function(){if(typeof editor!=='undefined'&&editor.setContent){editor.setContent("+JSON.stringify(CONFIG.bodyHtml)+");return 'OK:'+editor.getContent().length;}return 'NO_EDITOR';})()");
  log('正文: '+r);
  await sl(1000);
  await setCoverAI(sock);
  const ok=await publish(sock);
  log(ok?'✅ 文章已发布/提交':'⚠️ 未检测到成功信号，需人工确认');
  sock.close();
}
main().catch(e=>log('FATAL: '+e.message));
