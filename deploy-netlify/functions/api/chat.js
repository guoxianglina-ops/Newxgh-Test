// Cloudflare Pages Function —— DeepSeek 转发接口
// 路径：/api/chat
//
// 作用：前端只调这个同源接口，不带任何密钥；
//      真正的 API Key 从 Cloudflare 环境变量（DEEPSEEK_API_KEY）读取，只存在于服务端，
//      永远不会下发到浏览器，也不会出现在仓库里。

const UPSTREAM = 'https://api.deepseek.com/chat/completions';

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const key = env.DEEPSEEK_API_KEY;
  if (!key) {
    // 前端收到 503 会安静地退回本地知识库检索，不会报错给用户看
    return json({ error: 'no_key', message: '服务端未配置 DEEPSEEK_API_KEY' }, 503);
  }

  // 1. 请求体必须是合法 JSON
  let raw;
  try {
    raw = await request.text();
  } catch (e) {
    return json({ error: 'bad_request', message: '无法读取请求体' }, 400);
  }
  if (raw.length > 200000) {
    return json({ error: 'too_large', message: '请求体过大' }, 413);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    return json({ error: 'bad_request', message: '请求体不是合法 JSON' }, 400);
  }

  // 2. 白名单化：只透传需要的字段，并限制规模，避免这个接口被当成免费代理滥用
  const messages = Array.isArray(payload.messages) ? payload.messages.slice(-20) : [];
  if (messages.length === 0) {
    return json({ error: 'bad_request', message: '缺少 messages' }, 400);
  }
  const safe = {
    model: typeof payload.model === 'string' ? payload.model : 'deepseek-chat',
    messages: messages,
    max_tokens: Math.min(Number(payload.max_tokens) || 1024, 2048),
    temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.7,
    stream: false
  };

  // 3. 转发
  let upstream;
  try {
    upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify(safe)
    });
  } catch (e) {
    return json({ error: 'upstream_failed', message: '无法连接 DeepSeek：' + e.message }, 502);
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

// 同源调用理论上不需要 CORS，这里给个显式拒绝，避免被当成公共接口
export async function onRequestGet() {
  return json({ error: 'method_not_allowed', message: '请使用 POST' }, 405);
}
