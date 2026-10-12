# TACTICAL QA / 游戏活动 QA Agent

面向 AI 产品经理面试展示的可运行原型，包含两个独立页面：

- `index.html`：QA 测试工作台。
- `supply.html`：战术训练补给站（真实被测玩家页）。

## 本地启动

这是无构建依赖的静态站点。不要直接双击 HTML（跨页面状态与截图需要同源 HTTP 环境）。在项目根目录执行：

```powershell
node -e "const h=require('http'),f=require('fs'),p=require('path');h.createServer((q,s)=>{let x=q.url==='/'?'index.html':q.url.slice(1).split('?')[0];f.readFile(p.join(process.cwd(),'dist',x),(e,d)=>{if(e){s.statusCode=404;return s.end('not found')}s.setHeader('Content-Type',x.endsWith('.css')?'text/css':x.endsWith('.js')?'text/javascript':'text/html');s.end(d)})}).listen(4175,'127.0.0.1',()=>console.log('http://127.0.0.1:4175'))"
```

浏览器打开 `http://127.0.0.1:4175`。

## 演示路径

1. 点击“生成候选测试”，展开用例可查看前置、步骤、预期和需求依据。
2. 确认全部用例，选择 `A · 0.9.4 预埋缺陷` 并开始测试。
3. 工作台会通过 iframe 中真实的“领取今日补给”按钮执行操作；准备步骤通过受控工具完成。
4. 在 C03/C04 观察失败证据和 BUG-001 缺陷单。
5. 在“复测”中切换修复版重跑 C04，结果转为通过。
6. 点击“改为永久一次”，重新生成用例；C05 预期会变为“跨日不恢复”，而被测程序仍按旧的每日规则运行，因此会真实失败。
7. 点击“模拟工具超时”，下一次工具调用会在两次有限重试后标记为“执行异常”，不会生成业务缺陷。

## 业务实现

玩家页与工作台共享同源 `localStorage` 状态，但展示和操作页面互相独立。`supply.js` 暴露限定工具集用于测试准备；领取必须触发玩家页的真实按钮。缺陷版在容量检查前写入领取标记，修复版仅在发奖成功后写入。

## 模型配置

当前公开演示默认是“固定用例模式，未运行 AI 需求分析”，页面已明确标注。若接入模型，应新增服务端 `/api/analyze-requirement`：服务端从 `OPENAI_API_KEY` 环境变量读取密钥，返回经过 JSON Schema 校验的规则、待澄清事项和结构化用例；浏览器端不得接收或持久化密钥。模型只能从以下动作组合步骤：

`reset_account`、`set_inventory`、`advance_date`、`click_claim`、`read_state`、`capture_evidence`。

模型输出不得直接执行任意代码。确定性断言、截图、状态记录和最终结果分类仍由执行器负责。
