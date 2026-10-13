export async function GET() {
  return Response.json({
    ok: true,
    qwenConfigured: Boolean(process.env.DASHSCOPE_API_KEY),
    runner: 'browser-demo',
    model: process.env.QWEN_MODEL || 'qwen-plus'
  }, { headers: { 'cache-control': 'no-store' } });
}

