// 书签 URL 存活检测
// HEAD 优先，不支持或失败时降级 GET
//
// 判定原则：宁可漏判，也不要误判。
// Cloudflare 的检测节点在海外，大量国内站点与地区限制站点会超时或被拦，
// 这些都不能算作"书签失效"，否则会给用户制造大量假警报。
//
// 返回 status 取值：
//   'ok'      正常（2xx/3xx，或 401/403/429/451 等"站点存在但不让访问"）
//   'fail'    真失效（404/410，或域名已不存在/解析失败）
//   'unknown' 无法确认（超时、5xx、网络异常）—— 不算失效，仅提示
export async function checkUrl(targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { status: 'fail', code: 0, error: 'URL 格式无效' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { status: 'fail', code: 0, error: '不支持的协议：' + parsed.protocol };
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
  };

  const classify = (httpStatus) => {
    if (httpStatus === 404 || httpStatus === 410) return 'fail';
    // 2xx / 3xx：正常
    if (httpStatus < 400) return 'ok';
    // 401/403/405/406/429/451：站点存在，只是不欢迎自动化访问
    if ([401, 403, 405, 406, 429, 451].includes(httpStatus)) return 'ok';
    // 5xx（含 Cloudflare 的 520-527）：源站临时故障，不能判死
    if (httpStatus >= 500) return 'unknown';
    // 其余 4xx 一律不判死，保守处理
    return 'unknown';
  };

  // 第一轮：HEAD
  try {
    const res = await fetch(targetUrl, {
      method: 'HEAD',
      redirect: 'follow',
      headers,
      signal: AbortSignal.timeout(10000)
    });
    const verdict = classify(res.status);
    // HEAD 得到明确结论就直接返回；unknown 时再试 GET
    if (verdict !== 'unknown') {
      return { status: verdict, code: res.status, error: verdict === 'fail' ? `HTTP ${res.status}` : null };
    }
  } catch (error) {
    // 超时/连接失败，继续用 GET 复核
  }

  // 第二轮：GET（部分站点拒绝 HEAD，或不支持 HEAD）
  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      headers,
      signal: AbortSignal.timeout(10000)
    });
    const verdict = classify(res.status);
    return {
      status: verdict,
      code: res.status,
      error: verdict === 'fail' ? `HTTP ${res.status}` : null
    };
  } catch (error) {
    const msg = String(error?.message || error);
    // 明确是 DNS 解析失败 → 域名已不存在，判为失效
    if (/dns|resolve|not found|ENOTFOUND|EAI_AGAIN/i.test(msg)) {
      return { status: 'fail', code: 0, error: '域名解析失败' };
    }
    // 其余（超时、连接被重置）→ 无法确认，不判死
    return { status: 'unknown', code: 0, error: '无法连接（超时或网络受限）' };
  }
}
