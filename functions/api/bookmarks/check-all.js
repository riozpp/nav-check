import { checkUrl } from './_check-url.js'

// POST /api/bookmarks/check-all
// 定时全量检测（供 GitHub Actions 等外部调度器调用）
// 鉴权：Authorization: Bearer <CRON_SECRET>
// 请求体可选：{ limit?: number, onlyOld?: boolean }
//   limit   本次最多检测多少个（默认 50，防止 Workers 超时）
//   onlyOld 为 true 时优先检测从未检测 / 检测时间最早的
// 返回：{ success, total, ok, fail, remaining }
export async function onRequestPost(context) {
  const { request, env } = context

  const secret = env.CRON_SECRET
  if (!secret) {
    return new Response(JSON.stringify({ error: '未配置 CRON_SECRET，定时检测已禁用' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const auth = request.headers.get('Authorization') || ''
  if (auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    let body = {}
    try {
      body = await request.json()
    } catch {
      // 无请求体时使用默认参数
    }

    const limit = Math.min(Math.max(parseInt(body.limit, 10) || 50, 1), 100)
    const onlyOld = body.onlyOld !== false

    // 按“最久未检测”排序，实现滚动式全量覆盖
    const orderBy = onlyOld
      ? `ORDER BY CASE WHEN check_time IS NULL OR check_time = '' THEN 0 ELSE 1 END, check_time ASC`
      : 'ORDER BY id ASC'

    const { results } = await env.DB.prepare(
      `SELECT id, url FROM bookmarks ${orderBy} LIMIT ?`
    ).bind(limit).all()

    const { results: remainRows } = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM bookmarks WHERE check_time IS NULL OR check_time = ''`
    ).all()

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

    // 记录上次运行时间与结果，供设置页展示
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
      fail: checked.length - okCount,
      neverChecked: remainRows?.[0]?.cnt ?? 0
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Scheduled bookmark check error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
