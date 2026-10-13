const allowedTools = new Set([
  'reset_test_user',
  'set_inventory',
  'advance_test_date',
  'click_claim',
  'read_game_state',
  'capture_evidence'
]);

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { 'cache-control': 'no-store' }
});

export async function POST(request) {
  try {
    const key = process.env.DASHSCOPE_API_KEY;
    if (!key) return json({ error: 'DASHSCOPE_API_KEY 未配置' }, 503);

    const { requirement = '' } = await request.json();
    if (!String(requirement).trim()) return json({ error: '需求文本不能为空' }, 400);

    const prompt = `你是游戏活动QA测试设计专家。请根据需求生成严格JSON，不要输出Markdown。\n字段：rules:string[]；clarifications:string[]；cases:{name:string,basis:string,preconditions:string[],steps:{tool:string,input?:object}[],expected:string}[]。\n必须优先覆盖：首次领取、重复领取、背包满、满包失败后清空重试、跨日行为。\n工具仅允许：reset_test_user,set_inventory,advance_test_date,click_claim,read_game_state,capture_evidence。\n如果需求没有定义跨日资格，写入clarifications，不要臆测。\n需求：${String(requirement).slice(0, 12000)}`;
    const response = await fetch(process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.QWEN_MODEL || 'qwen-plus',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });
    if (!response.ok) {
      console.error('Qwen request failed', response.status);
      return json({ error: `Qwen 调用失败（HTTP ${response.status}）` }, 502);
    }

    const payload = await response.json();
    const result = JSON.parse(payload.choices?.[0]?.message?.content || '{}');
    result.rules = Array.isArray(result.rules) ? result.rules.map(String).slice(0, 12) : [];
    result.clarifications = Array.isArray(result.clarifications) ? result.clarifications.map(String).slice(0, 8) : [];
    result.cases = Array.isArray(result.cases) ? result.cases.slice(0, 10).map(testCase => ({
      name: String(testCase?.name || '未命名用例'),
      basis: String(testCase?.basis || '需求文本'),
      preconditions: Array.isArray(testCase?.preconditions) ? testCase.preconditions.map(String) : [],
      steps: Array.isArray(testCase?.steps) ? testCase.steps
        .filter(step => allowedTools.has(step?.tool))
        .map(step => ({ tool: step.tool, input: step.input && typeof step.input === 'object' ? step.input : undefined })) : [],
      expected: String(testCase?.expected || '')
    })) : [];
    return json(result);
  } catch (error) {
    console.error('Qwen analyze error', error);
    return json({ error: '模型响应无法解析，请重试' }, 502);
  }
}

