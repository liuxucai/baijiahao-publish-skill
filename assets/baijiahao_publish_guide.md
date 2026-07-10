# 百家号文章自动发布流程文档

> 作者：总文章发布助手
> 更新：2026-07-01（v7 重大修正见下方）
> 适用平台：百家号（baijiahao.baidu.com）

> ⚠️ **v7 实测修正（2026-07-10 二次发布验证）**：
> 本文档中的 **xb ref 点击（e109/e76/e72/e14 等）和 `button.click()` 方案对百家号编辑器不可靠**——
> 百家号编辑器是 cheetah/FeEditorApp 自研组件，对 xb click、CDP 坐标点击命中 `<span>` 子节点、
> 以及 in-page `.click()`/`dispatchEvent` 合成事件**基本不响应**，仅接受 **CDP `Input.dispatchMouseEvent` 真实鼠标坐标点击**，
> 且坐标必须基于元素 `getBoundingClientRect` 运行时计算（用 `cdp_lib.cdpClickEl`），**禁止硬编码、禁止 `.click()`**。
> - 封面占位项真实元素：`DIV.FeEditorApp-_73a3a52aab7e3a36-default`（嵌在列表容器内，真实中心偏左约 299,535，勿点列表正中）。
> - AI 生成触发：是 `SPAN.FeEditorApp-_6853aa778d53acdc-theme` 文本“根据全文智能生成封面”，非 button、非图标 DIV。
> - 生成完成按钮文字为“确定 (1)”，检测用 `indexOf('确定')`。
> - 发布按钮：**必须用 CDP 真实鼠标点击**，in-page `button.click()` 返回 CLICKED 但 URL 不变（18:54 实测）。
> 详细可靠步骤以 `SKILL.md` 与 `references/workflow.md` 的“第二次实测修正”为准。本文档保留作结构参考。

---

## 一、发布前准备

### 1.1 环境确认

| 项目 | 说明 |
|------|------|
| 浏览器 | 正式版 Chrome（非 cft 测试版） |
| 控制工具 | xb CLI（路径固定：`C:\Users\甲骨龙集成电脑\.qclaw\skills\xbrowser\scripts\xb.cjs`） |
| 运行环境 | Windows PowerShell，**不**支持 `&&` 链式语法 |
| 脚本格式 | 所有操作封装为 `.js` 文件，用 `node script.js` 执行 |

### 1.2 百家号后台 URL

- 首页（已登录）：`https://baijiahao.baidu.com/builder/rc/home`
- 发布页：`https://baijiahao.baidu.com/builder/rc/edit?type=news`

---

## 二、标准发布流程

### Step 1 — 打开浏览器并登录

```bash
node C:\Users\甲骨龙集成电脑\.qclaw\skills\xbrowser\scripts\xb.cjs run --browser chrome open https://baijiahao.baidu.com
```

> 若跳转到登录页，手动登录一次（账号：13414054304）后会话会保持。

---

### Step 2 — 进入发布页

```
URL: https://baijiahao.baidu.com/builder/rc/edit?type=news
```

> 注意：URL 中的 `?is_from_cms=1` 参数可能导致误解析，需等待页面完全加载后再操作。
> 使用 `wait --load networkidle` 等待网络空闲。

---

### Step 3 — 关闭弹窗引导

1. **AI助手弹窗**：点击"我知道了"按钮（获取最新 ref 后点击）
2. **引导弹窗**：连续点击"下一步"×4次，关闭所有引导

---

### Step 4 — 填写标题

1. 获取当前 snapshot，找到标题框 ref（如 e77）
2. 点击标题框 → 全选（Ctrl+A）→ 删除旧内容
3. 输入新标题

```js
// Node.js 脚本示例
const r1 = await xb(['run', '--browser', 'chrome', 'click', 'e77']);
await xb(['run', '--browser', 'chrome', 'press', 'e77', 'Control+a']);
await xb(['run', '--browser', 'chrome', 'press', 'e77', 'Delete']);
await xb(['run', '--browser', 'chrome', 'type', 'e77', '"新标题"']);
```

---

### Step 5 — 填写正文（关键难点）

**正文区位于 iframe 内，不能直接 type，必须先点击 iframe 内部获得焦点。**

#### 5.1 获取正文 iframe ref

执行 snapshot，找到正文 iframe（角色通常为 `generic`，后接 iframe 节点）。

#### 5.2 精准点击 iframe 内部

```js
// 用 CSS selector 语法精准点击 iframe 内部
await xb(['run', '--browser', 'chrome', 'click', 'iframe body']);
```

> ⚠️ 直接点击 iframe ref（如 `e48`）在百家号编辑器中**无效**，必须用 CSS selector `iframe body`。

#### 5.3 清空旧内容

```js
await xb(['run', '--browser', 'chrome', 'press', 'iframe body', 'Control+a']);
await xb(['run', '--browser', 'chrome', 'press', 'iframe body', 'Delete']);
```

> ⚠️ 在 iframe 内按 Ctrl+A 后再按 Delete，第一次可能不生效。如内容仍存在，重复操作一次。

#### 5.4 分段输入正文

正文内容较长时，分段输入，每段不超过约500字：

```js
await xb(['run', '--browser', 'chrome', 'type', 'iframe body', '第一段内容...']);
await new Promise(r => setTimeout(r, 500)); // 短暂等待
await xb(['run', '--browser', 'chrome', 'type', 'iframe body', '第二段内容...']);
```

---

### Step 6 — 设置封面（核心难点）

#### 6.1 封面设置路径

百家号封面设置的**正确路径**是：

1. 在发布页右侧面板，找到**「采用AI生成内容」**复选框
2. 点击该复选框（ref 通常为 e62/e63/e67）
3. 弹出**封面选择对话框**，包含三个标签页：
   - `正文/本地上传` — 本地上传图片
   - `AI封图` ← **推荐使用**（AI智能生成封面）
   - `免费正版图库` — 平台图库选择

#### 6.2 AI封图操作步骤

**进入 AI封图 标签页：**

```js
// 弹出对话框后，找到 AI封图 标签页并点击
await xb(['run', '--browser', 'chrome', 'click', 'e76']); // e76 = AI封图 tab
```

**生成封面：**

对话框中有两种生成方式：

- **方式一（推荐）：一键生成**
  - 点击"根据全文智能生成封面"按钮（ref 通常为 e109）
  - 等待约30秒，AI 自动根据文章标题生成封面
  - 出现封面预览图后，"确定"按钮自动激活

- **方式二：手动输入提示词**
  - 在文本框（ref 通常为 e94）中输入封面描述
  - 选择风格（写实风/插画风/卡通风）
  - 点击生成按钮

**确认封面：**

```js
// 确认按钮（封面生成后，"确定"按钮的 ref 通常变为 e72）
await xb(['run', '--browser', 'chrome', 'click', 'e72']);
```

> ✅ 封面应用成功后，页面右侧会出现"编辑"和"更换封面"按钮，证实封面已正确绑定。

#### 6.3 封面设置常见问题

| 问题 | 现象 | 解决方法 |
|------|------|----------|
| 点击"采用AI生成内容"无反应 | 复选框状态不变 | 重新获取 snapshot，用最新 ref 点击 |
| 封面选择弹窗不出现 | 点击后页面无变化 | 确认单图/三图模式已选中；重试点击 |
| AI生成后"确定"按钮禁用 | 按钮 `disabled=true` | 等待更长时间（封面生成需要数秒）；点击"重新生成"后再试 |
| 提示"请添加一张横版封面图" | 发布时被拦截 | 按 Step 6.1 完整流程设置封面 |

---

### Step 7 — 发布

```js
await xb(['run', '--browser', 'chrome', 'click', 'e14']); // 发布按钮
```

发布成功后页面显示：
- `提交成功，正在审核中...`
- `文章发布成功`

---

### Step 8 — 清理工作目录截图

发布完成后，删除发布过程中产生的所有截图文件，避免工作目录堆积。

```js
const fs = require('fs');
const path = require('path');

// 清理 xb CLI 默认截图目录
const screenDir = 'C:\\Users\\甲骨龙集成电脑\\.agent-browser\\tmp\\screenshots';
if (fs.existsSync(screenDir)) {
  fs.readdirSync(screenDir).forEach(f => {
    if (f.endsWith('.png') || f.endsWith('.jpg')) {
      fs.unlinkSync(path.join(screenDir, f));
    }
  });
  console.log('Screenshots cleaned:', screenDir);
}

// 清理工作目录下的截图文件
const wsDir = 'C:\\Users\\甲骨龙集成电脑\\.qclaw\\workspace-agent-beb420bf';
fs.readdirSync(wsDir).forEach(f => {
  if ((f.endsWith('.png') || f.endsWith('.jpg')) && f.startsWith('screenshot-')) {
    fs.unlinkSync(path.join(wsDir, f));
  }
});
console.log('Workspace screenshots cleaned');
```

> ⚠️ 清理范围：`screenshot-*.png`、`*.jpg` 文件。`cover/*.jpg` 等人工生成的封面图不在此列。

---

## 三、问题与解决方案汇总

### 3.1 封面相关问题（重点）

| # | 问题 | 根因 | 解决方法 |
|---|------|------|----------|
| F1 | 点击"选择封面"按钮无响应 | 按钮实际在弹窗触发前不可直接点击 | 先点击"采用AI生成内容"复选框，弹出对话框后再操作 |
| F2 | AI封面复选框点击无反应 | 元素 ref 已变化或焦点问题 | 获取最新 snapshot，用新 ref 点击 |
| F3 | "确定"按钮禁用，无法确认封面 | 封面图尚未生成完毕 | 等待10秒；点击"重新生成"按钮后再等 |
| F4 | 发布时提示"请添加一张横版封面图" | 封面未正确绑定到文章 | 确认弹窗的"确定"按钮已点击，对话框已关闭 |
| F5 | 多次点击"生成封面"但无封面出现 | 触发方式不对 | 确认点击的是"根据全文智能生成封面"按钮，而非普通文本输入框 |

### 3.2 正文输入问题

| # | 问题 | 根因 | 解决方法 |
|---|------|------|----------|
| B1 | 内容写到 AI 助手面板而非正文区 | 正文在 iframe 内，直接 type 写到了页面主体输入框 | 先 `click iframe body` 获得焦点，再 type |
| B2 | Ctrl+A+Delete 在 iframe 内无效 | 焦点未正确进入 iframe 可编辑区域 | 用 CSS selector `click iframe body` 精准定位 |
| B3 | 正文内容重复追加 | 清空操作无效，新内容追加到旧内容后 | 重复 Ctrl+A+Delete 两次；或刷新页面重新输入 |
| B4 | 内容分段输入时格式错乱 | 换行符处理不当 | 使用 `type` 命令（保留格式），避免 `fill` 命令 |

### 3.3 工具兼容性问题

| # | 问题 | 解决方法 |
|---|------|----------|
| T1 | xb CLI 在 PowerShell 中输出中文乱码（`閫氳繃鐜...`），导致 exit code 非零 | 编写独立 Node.js 脚本（`.js`）封装所有 xb 操作；Node.js 层捕获 exit code |
| T2 | PowerShell 不支持 `&&` 链式语法 | 改用分号 `;` 分隔，或改用 Node.js 脚本串联 |
| T3 | PowerShell 配置文件 `$PROFILE` 干扰 xb CLI | 独立脚本 + `node script.js` 执行，绕过 PowerShell 配置 |
| T4 | browser MCP 工具与 xb CLI CDP 会话不一致 | 弃用 browser MCP，**统一使用 xb CLI** |
| T5 | xb CLI `fill` 命令输入中文时编码损坏 | 改用 `type` 命令；中文内容较多时分多段 type |
| T6 | xb CLI `evaluate` 命令不可用 | 改用 CDP WebSocket 直连（需安装 chrome-remote-interface 和 ws）；或用 Node.js 脚本封装 |
| T7 | xb CLI 不支持 `--selector` 参数 | 使用 CSS selector 内嵌语法，如 `click iframe body` |

### 3.4 页面导航问题

| # | 问题 | 解决方法 |
|---|------|----------|
| N1 | 登录后被重定向到搜狐号 | 重新打开百家号发布页 URL |
| N2 | URL 参数 `?is_from_cms=1` 被误解析 | 去掉该参数，或使用 `wait --load networkidle` 等待 |
| N3 | 页面状态不明（about:blank） | 用 `xb run get url` 确认当前 URL；重新打开发布页 |
| N4 | snapshot 超时返回空 | 重新执行 snapshot；确认浏览器已加载正确页面 |

---

## 四、xb CLI 常用命令参考

```bash
# 打开页面
node xb.cjs run --browser chrome open https://url.com

# 截图
node xb.cjs run --browser chrome screenshot

# 快照（获取页面元素）
node xb.cjs run --browser chrome snapshot

# 点击元素
node xb.cjs run --browser chrome click <ref>

# 输入文本
node xb.cjs run --browser chrome type <ref> "文本内容"

# 清空并填入（慎用，中文编码有问题）
node xb.cjs run --browser chrome fill <ref> "文本内容"

# 按键
node xb.cjs run --browser chrome press <ref> <key>

# CSS selector 点击
node xb.cjs run --browser chrome click "iframe body"

# 获取当前 URL
node xb.cjs run --browser chrome get url

# 查看帮助
node xb.cjs help
```

> **xb CLI 版本**：`0.25.3`
> **支持**：`snapshot, click, fill, type, press, screenshot, open, get url`
> **不支持**：`evaluate, --selector`

---

## 五、完整发布脚本模板

```js
const { spawn } = require('child_process');
const XB = 'C:\\Users\\甲骨龙集成电脑\\.qclaw\\skills\\xbrowser\\scripts\\xb.cjs';

function xb(args, t = 30000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [XB, ...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    const timer = setTimeout(() => { try { proc.kill(); } catch (e) {} reject(new Error('timeout')); }, t);
    proc.stdout.on('data', d => out += d.toString());
    proc.on('close', code => { clearTimeout(timer); resolve({ code, out }); });
    proc.on('error', e => { clearTimeout(timer); reject(e); });
  });
}

async function publish() {
  // 1. 打开发布页
  await xb(['run', '--browser', 'chrome', 'open', 'https://baijiahao.baidu.com/builder/rc/edit?type=news']);
  await new Promise(r => setTimeout(r, 3000));

  // 2. 获取快照，关闭弹窗（根据实际 ref 调整）
  // await xb(['run', '--browser', 'chrome', 'click', 'e30']); // "我知道了"

  // 3. 点击标题框，输入标题
  await xb(['run', '--browser', 'chrome', 'click', 'e77']);
  await xb(['run', '--browser', 'chrome', 'press', 'e77', 'Control+a']);
  await xb(['run', '--browser', 'chrome', 'press', 'e77', 'Delete']);
  await xb(['run', '--browser', 'chrome', 'type', 'e77', '"文章标题"']);

  // 4. 点击正文 iframe 并输入正文
  await xb(['run', '--browser', 'chrome', 'click', 'iframe body']);
  await xb(['run', '--browser', 'chrome', 'press', 'iframe body', 'Control+a']);
  await xb(['run', '--browser', 'chrome', 'press', 'iframe body', 'Delete']);
  await xb(['run', '--browser', 'chrome', 'type', 'iframe body', '正文内容...']);

  // 5. 设置 AI 封面
  const snap = JSON.parse((await xb(['run', '--browser', 'chrome', 'snapshot'])).out);
  const refs = snap.data.result.data.refs;
  // 找到"采用AI生成内容"复选框并点击
  const aiCheck = Object.entries(refs).find(([k, v]) => v.name && v.name.includes('\u91C7\u7528AI\u751F\u6210\u5185\u5BB9'));
  if (aiCheck) {
    await xb(['run', '--browser', 'chrome', 'click', aiCheck[0]]);
    await new Promise(r => setTimeout(r, 2000));
    // 找到 AI封图 tab 并点击
    const aiTab = Object.entries(refs).find(([k, v]) => v.name && v.name.includes('AI\u5C01\u56FE'));
    if (aiTab) {
      await xb(['run', '--browser', 'chrome', 'click', aiTab[0]]);
      await new Promise(r => setTimeout(r, 1000));
    }
    // 点击"根据全文智能生成封面"按钮
    const genBtn = Object.entries(refs).find(([k, v]) => v.name && v.name.includes('\u6839\u636E\u5168\u6587\u667A\u80FD\u751F\u6210'));
    if (genBtn) {
      await xb(['run', '--browser', 'chrome', 'click', genBtn[0]]);
      await new Promise(r => setTimeout(r, 10000)); // 等待 AI 生成
    }
    // 点击确定
    const confirmBtn = Object.entries(refs).find(([k, v]) => v.role === 'button' && v.name.includes('\u786E\u5B9A'));
    if (confirmBtn) {
      await xb(['run', '--browser', 'chrome', 'click', confirmBtn[0]]);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

    // 6. 发布
  await xb(['run', '--browser', 'chrome', 'click', 'e14']);
  await new Promise(r => setTimeout(r, 3000));

  // 7. 清理截图
  const fs = require('fs');
  const screenDir = 'C:\\Users\\甲骨龙集成电脑\\.agent-browser\\tmp\\screenshots';
  if (fs.existsSync(screenDir)) {
    fs.readdirSync(screenDir).forEach(f => {
      if (f.endsWith('.png')) fs.unlinkSync(path.join(screenDir, f));
    });
  }
  const wsDir = 'C:\\Users\\甲骨龙集成电脑\\.qclaw\\workspace-agent-beb420bf';
  fs.readdirSync(wsDir).forEach(f => {
    if (f.startsWith('screenshot-') && (f.endsWith('.png') || f.endsWith('.jpg'))) {
      fs.unlinkSync(path.join(wsDir, f));
    }
  });
}

publish().catch(e => console.error('ERR:', e.message));
```

---

## 六、发布结果记录

| 文章标题 | 发布时间 | 状态 | 封面 |
|----------|----------|------|------|
| 文言文的美妙 | 2026-07-01（首次尝试） | 未完成（内容输入阶段中断） | — |
| 人工智能的发展 | 2026-07-01 12:28 | ✅ 成功（审核中） | AI封图（智能生成） |

---

*文档版本：v1.1 | 总文章发布助手*
