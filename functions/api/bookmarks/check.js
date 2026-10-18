// POST /api/bookmarks/check
// 批量检测书签 URL 的有效性（需要登录）
// 请求体: { ids: number[] }  每次最多检测 30 个
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { ids } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return new Response(JSON.stringify({ error: '缺少书签 ID 列表' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 限制单次检测数量，避免超出 Workers 执行时间限制
    const limitedIds = ids.slice(0, 30);

    const placeholders = limitedIds.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT id, url FROM bookmarks WHERE id IN (${placeholders})`
    ).bind(...limitedIds).all();

    const checkResults = await Promise.all(results.map(async (row) => {
      const result = await checkUrl(row.url);
      const now = new Date().toISOString();

      await env.DB.prepare(
        'UPDATE bookmarks SET check_status = ?, check_code = ?, check_time = ? WHERE id = ?'
      ).bind(result.ok ? 'ok' : 'fail', result.status, now, row.id).run();

      return {
        id: row.id,
        url: row.url,
        ok: result.ok,
        status: result.status,
        error: result.error || null,
        check_time: now
      };
    }));

    const okCount = checkResults.filter(r => r.ok).length;

    return new Response(JSON.stringify({
      success: true,
      total: checkResults.length,
      ok: okCount,
      fail: checkResults.length - okCount,
      results: checkResults
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Bookmark check error:', error);
    return new Response(JSON.stringify({ error: '检测失败：' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 检测单个 URL：先 HEAD，失败（405/501 或网络错误）时回退 GET
async function checkUrl(targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { ok: false, status: 0, error: 'URL 格式无效' };
  }

  // 仅支持 http/https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, status: 0, error: '不支持的协议：' + parsed.protocol };
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Accept': '*/*'
  };

  const withTimeout = (signalController) => {
    return setTimeout(() => signalController.abort(), 8000);
  };

  // 第一次尝试 HEAD
  try {
    const headController = new AbortController();
    const timer = withTimeout(headController);
    try {
      const response = await fetch(targetUrl, {
        method: 'HEAD',
        headers,
        redirect: 'follow',
        signal: headController.signal
      });
      // 2xx/3xx/401/403 都认为链接可达（401/403 说明站点存在但需要权限）
      if (response.status < 400 || response.status === 401 || response.status === 403) {
        return { ok: true, status: response.status };
      }
      // 405/501 等表示服务器不支持 HEAD，回退 GET
      if (response.status !== 405 && response.status !== 501) {
        return { ok: false, status: response.status, error: 'HTTP ' + response.status };
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // HEAD 网络错误，回退 GET 再试一次
  }

  // 回退 GET
  try {
    const getController = new AbortController();
    const timer = withTimeout(getController);
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers,
        redirect: 'follow',
        signal: getController.signal
      });
      const ok = response.status < 400 || response.status === 401 || response.status === 403;
      return ok
        ? { ok: true, status: response.status }
        : { ok: false, status: response.status, error: 'HTTP ' + response.status };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return { ok: false, status: 0, error: '无法连接：' + (error.message || 'timeout') };
  }
}
