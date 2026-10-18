// 书签 URL 存活检测（与 /api/bookmarks/check 共用）
// HEAD 优先，不支持或失败时降级 GET
// 判定策略（借鉴 deerwan/bookmark-nav）：
//   仅 404/410 与网络失败判定为失效，其余状态码（403/429/5xx 等）一律视为可达，
//   避免把开启反爬的站点误判为死链
export async function checkUrl(targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { ok: false, status: 0, error: 'URL 格式无效' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, status: 0, error: '不支持的协议：' + parsed.protocol };
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
  };

  const isAlive = (status) => status !== 404 && status !== 410;

  try {
    const head = await fetch(targetUrl, {
      method: 'HEAD',
      redirect: 'follow',
      headers,
      signal: AbortSignal.timeout(8000)
    });
    // 服务器正常响应即可达（含 403/429/5xx），仅 404/410 判死
    return { ok: isAlive(head.status), status: head.status, ...(isAlive(head.status) ? {} : { error: 'HTTP ' + head.status }) };
  } catch {
    // HEAD 失败/超时，降级 GET 再试
  }

  try {
    const get = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      headers,
      signal: AbortSignal.timeout(8000)
    });
    const ok = isAlive(get.status);
    return { ok, status: get.status, ...(ok ? {} : { error: 'HTTP ' + get.status }) };
  } catch (error) {
    return { ok: false, status: 0, error: '无法连接：' + (error.message || 'timeout') };
  }
}
