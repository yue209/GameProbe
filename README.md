# TACTICAL QA / 游戏活动 QA Agent

面向 AI 产品经理面试展示的可运行原型，包含两个独立页面：

- `index.html`：QA 测试工作台。
- `supply.html`：战术训练补给站（真实被测玩家页）。

## 本地启动

安装依赖并启动本地全栈服务：

```powershell
pnpm install
$env:DASHSCOPE_API_KEY="你的服务端密钥"
pnpm start
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

本地服务通过 `/api/agent/analyze` 调用 Qwen-Plus，通过 `/api/agent/run` 启动 Playwright。服务端从 `DASHSCOPE_API_KEY` 环境变量读取密钥；浏览器端不会接收或持久化密钥。未配置密钥时，前端明确显示“Qwen 未配置”，仍可运行固定用例。模型只能从以下动作组合步骤：

`reset_account`、`set_inventory`、`advance_date`、`click_claim`、`read_state`、`capture_evidence`。

模型输出不得直接执行任意代码。确定性断言、截图、状态记录和最终结果分类仍由执行器负责。

直接运行真实浏览器回归：

```powershell
pnpm test:buggy
pnpm test:fixed
```

执行证据保存在 `artifacts/<run-id>/`，包括真实页面 PNG 截图和 `report.json`。
