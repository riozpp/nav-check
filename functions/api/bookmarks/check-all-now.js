import { checkUrl } from './_check-url.js'

// POST /api/bookmarks/check-all-now
// 登录用户手动触发一次滚动全量检测（鉴权走全局中间件的登录 token）
// 与定时任务共用同一套滚动策略，但不需要 CRON_SECRET
export async function onRequestPost(context) {
  const { request, env } = context

  try {
    let body = {}
    try {
      body = await request.json()
    } catch {
      // 无请求体使用默认值
    }

    const limit = Math.min(Math.max(parseInt(body.limit, 10) || 50, 1), 100)

    const { results } = await env.DB.prepare(
      `SELECT id, url FROM bookmarks
       ORDER BY CASE WHEN check_time IS NULL OR check_time = '' THEN 0 ELSE 1 END, check_time ASC
       LIMIT ?`
    ).bind(limit).all()

    const CONCURRENCY = 8
    const checked = new Array(results.length)
    let cursor = 0

    const worker = async () => {
      while (cursor < results.length) {
        const index = cursor++
        const row = results[index]
        const result = await checkUrl(row.url)
        checked[index] = {
          id: row.id,
          ok: result.ok,
          status: result.status,
          check_time: new Date().toISOString()
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, results.length || 1) }, worker)
    )

    if (checked.length > 0) {
      await env.DB.batch(checked.map(r =>
        env.DB.prepare(
          'UPDATE bookmarks SET check_status = ?, check_code = ?, check_time = ? WHERE id = ?'
        ).bind(r.ok ? 'ok' : 'fail', r.status, r.check_time, r.id)
      ))
    }

    const okCount = checked.filter(r => r.ok).length
    const summary = JSON.stringify({
      at: new Date().toISOString(),
      total: checked.length,
      ok: okCount,
      fail: checked.length - okCount
    })
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('linkCheckLastRun', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
    ).bind(summary).run()

    return new Response(JSON.stringify({
      success: true,
      total: checked.length,
      ok: okCount,
      fail: checked.length - okCount
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Manual check-all error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
