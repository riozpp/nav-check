import { checkUrl } from './_check-url.js'

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

    // 并发池：控制峰值连接数，避免一次性打出太多外部请求
    const CONCURRENCY = 8;
    const checkResults = new Array(results.length);
    let cursor = 0;

    const worker = async () => {
      while (cursor < results.length) {
        const index = cursor++;
        const row = results[index];
        const result = await checkUrl(row.url);
        checkResults[index] = {
          id: row.id,
          url: row.url,
          ok: result.ok,
          status: result.status,
          error: result.error || null,
          check_time: new Date().toISOString()
        };
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, results.length || 1) }, worker)
    );

    // 批量写回检测结果（D1 batch，一次往返完成多条更新）
    if (checkResults.length > 0) {
      await env.DB.batch(checkResults.map(r =>
        env.DB.prepare(
          'UPDATE bookmarks SET check_status = ?, check_code = ?, check_time = ? WHERE id = ?'
        ).bind(r.ok ? 'ok' : 'fail', r.status, r.check_time, r.id)
      ));
    }

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
