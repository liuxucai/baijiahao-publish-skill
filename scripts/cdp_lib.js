// cdp_lib.js — 可复用 CDP WebSocket 库（连接/坐标点击/eval/上传文件）
var http = require('http');
var ws = require('ws');

function cdpConnect(port, pageUrlHint) {
  return new Promise(function (rs) {
    http.get('http://127.0.0.1:' + port + '/json', function (r) {
      var d = '';
      r.on('data', function (c) { d += c; });
      r.on('end', function () {
        try {
          var lst = JSON.parse(d);
          var pg = lst.find(function (t) {
            return t.type === 'page' && (t.url.indexOf('edit') !== -1 || t.url.indexOf('builder/rc') !== -1);
          }) || lst.find(function (t) { return t.type === 'page'; }) || lst[0];
          if (!pg || !pg.webSocketDebuggerUrl) { rs(null); return; }
          var sock = new ws(pg.webSocketDebuggerUrl);
          sock.p = {}; sock.m = 0;
          sock.on('message', function (d) {
            try { var m = JSON.parse(d.toString()); if (m.id && sock.p[m.id]) sock.p[m.id](m); } catch (e) {}
          });
          sock.on('open', function () { sock.ok = true; rs(sock); });
          sock.on('error', function () { if (!sock.ok) rs(null); });
          setTimeout(function () { if (!sock.ok) { try { sock.close(); } catch (e) {} rs(null); } }, 3000);
        } catch (e) { rs(null); }
      });
    }).on('error', function () { rs(null); });
  });
}

function cdp(sock, method, params) {
  return new Promise(function (rs) {
    var id = ++sock.m;
    sock.p[id] = function (r) { rs(r); };
    try { sock.send(JSON.stringify({ id: id, method: method, params: params || {} })); }
    catch (e) { rs(null); return; }
    setTimeout(function () { if (sock.p[id]) { delete sock.p[id]; rs(null); } }, 15000);
  });
}

function cdpEval(sock, expr) {
  return cdp(sock, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false })
    .then(function (r) { return r && r.result && r.result.result ? r.result.result.value : null; });
}

// 真实坐标点击（绕过 React isTrusted 检查）
function cdpClickXY(sock, x, y) {
  return cdp(sock, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: x, y: y, button: 'left', buttons: 0 })
    .then(function () { return cdp(sock, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: x, y: y, button: 'left', buttons: 1, clickCount: 1 }); })
    .then(function () { return cdp(sock, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: x, y: y, button: 'left', buttons: 0, clickCount: 1 }); });
}

// 给隐藏的 file input 设置本地文件（绕过系统文件对话框）
function setFileInputFiles(sock, fileAbsPath) {
  return cdp(sock, 'Runtime.evaluate', {
    expression: "(function(){var inp=document.querySelector('.ant-modal input[type=file],.cheetah-modal-w input[type=file],.cover-modal input[type=file],input[type=file]');if(!inp)return 'NF';return 'OK';})()",
    returnByValue: true
  }).then(function () {
    return cdp(sock, 'Runtime.evaluate', {
      expression: "(function(){var inp=document.querySelector('.ant-modal input[type=file],.cheetah-modal-w input[type=file],.cover-modal input[type=file],input[type=file]');return 'OK';})()",
      objectId: undefined
    });
  }).then(function () {
    // 用 Runtime 拿 objectId -> DOM.requestNode -> setFileInputFiles
    return cdp(sock, 'Runtime.evaluate', {
      expression: "document.querySelector('.ant-modal input[type=file],.cheetah-modal-w input[type=file],.cover-modal input[type=file],input[type=file]') || null",
      returnByValue: false
    }).then(function (r) {
      var oid = r && r.result && r.result.result && r.result.result.objectId;
      if (!oid) return Promise.resolve('NO_OBJ');
      return cdp(sock, 'DOM.requestNode', { objectId: oid }).then(function (rn) {
        var nodeId = rn && rn.result && rn.result.nodeId;
        if (!nodeId) return 'NO_NODE';
        return cdp(sock, 'DOM.setFileInputFiles', { nodeId: nodeId, files: [fileAbsPath] }).then(function () { return 'SET'; });
      });
    });
  });
}

function cdpInsertText(sock, text) {
  return cdp(sock, 'Input.insertText', { text: text });
}

// 真实鼠标点击元素：先滚入视口 → 取 getBoundingClientRect 中心 → dispatchMouseEvent
// 关键：百家号 cheetah/FeEditorApp 组件对 in-page .click()/合成事件不响应，必须用真实鼠标坐标点击；
//      坐标必须动态计算，严禁硬编码（分辨率/视口不同坐标会变）。
// finderExpr: 返回目标元素的 JS 表达式字符串，如 "document.querySelector('.x')"
function cdpClickEl(sock, finderExpr) {
  return cdpEval(sock, "(function(){try{var e=(" + finderExpr + ");if(!e)return 'NF';if(e.scrollIntoView)e.scrollIntoView({block:'center'});return 'SCROLLED';}catch(ex){return 'ERR:'+ex.message;}})()")
    .then(function () { return new Promise(function (r) { setTimeout(r, 900); }); })
    .then(function () {
      return cdpEval(sock, "(function(){try{var e=(" + finderExpr + ");if(!e||e.offsetWidth===0)return 'NF';var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}catch(ex){return 'ERR';}})()");
    })
    .then(function (rc) {
      if (typeof rc !== 'string' || rc.indexOf('{') !== 0) return Promise.resolve(rc);
      var p = JSON.parse(rc);
      return cdpClickXY(sock, p.x, p.y);
    });
}

module.exports = { cdpConnect: cdpConnect, cdp: cdp, cdpEval: cdpEval, cdpClickXY: cdpClickXY, cdpClickEl: cdpClickEl, setFileInputFiles: setFileInputFiles, cdpInsertText: cdpInsertText };
