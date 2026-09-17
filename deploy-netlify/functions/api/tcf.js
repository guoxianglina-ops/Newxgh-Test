// TestCaseForge 的备用转发接口（Cloudflare Pages Function）
//
// 为什么要有这个文件：
//   Worker 的 *.workers.dev 域名在国内被 DNS 投毒，无代理的机器连不上。
//   而本 Pages 项目所在的 *.pages.dev 实测可以直连（3.2s 返回 200）。
//   所以这里放一份和 worker.js 完全同逻辑的接口，作为客户端的最后一级回退。
//
// 路由：GET  /api/tcf   → 健康检查
//       POST /api/tcf   → 生成
//
// 环境变量：复用本项目已有的 DEEPSEEK_API_KEY（Cloudflare 后台已配置）

const UPSTREAM = 'https://api.deepseek.com/chat/completions';

// 界面下拉里的模型名 → 上游真实模型名
const MODEL_MAP = {
  'deepseek-v4-flash': 'deepseek-chat',
  'deepseek-v4-pro': 'deepseek-reasoner'
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }, CORS)
  });
}

// 健康检查——客户端用它判断这个地址通不通、服务端有没有配 Key
export async function onRequestGet(context) {
  const { env } = context;
  return json({ ok: true, hasKey: !!env.DEEPSEEK_API_KEY, via: 'pages' });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const key = env.DEEPSEEK_API_KEY;
  if (!key) return json({ error: 'no_key', message: '服务端未配置 DEEPSEEK_API_KEY' }, 503);

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return json({ error: 'bad_request', message: '请求体不是合法 JSON' }, 400);
  }

  const userText = typeof payload.user === 'string' ? payload.user : '';
  if (!userText) return json({ error: 'bad_request', message: '缺少 user' }, 400);

  const messages = [];
  if (payload.system) messages.push({ role: 'system', content: String(payload.system) });
  messages.push({ role: 'user', content: userText });

  const requested = typeof payload.model === 'string' ? payload.model : '';
  const model = MODEL_MAP[requested] || env.DEFAULT_MODEL || 'deepseek-chat';

  const body = {
    model,
    messages,
    max_tokens: Math.min(Number(payload.max_tokens) || 8192, 16384),
    temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.3,
    stream: false
  };

  let up;
  try {
    up = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify(body)
    });
  } catch (e) {
    return json({ error: 'upstream_failed', message: '无法连接模型服务：' + e.message }, 502);
  }

  const text = await up.text();
  if (up.status !== 200) {
    return json({ error: 'upstream_error', status: up.status, detail: text.slice(0, 500) }, 502);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return json({ error: 'bad_upstream_response' }, 502);
  }

  const choice = data.choices && data.choices[0];
  const content = choice && choice.message ? (choice.message.content || '') : '';

  return json({
    text: content,
    model: data.model || model,
    usage: data.usage || null
  });
}
