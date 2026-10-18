// POST /api/bookmarks/batch-fetch-icons
// 批量补全书签图标：优先使用站点自身 favicon，失败时用第三方图标服务兜底
// 请求体: { limit?: number, force?: boolean }
//   limit 本次最多处理多少个（默认 30，可选 1-60）
//   force 为 true 时连已有图标的也重新抓取
export async function onRequestPost(context) {
  const { request, env } = context

  try {
    let body = {}
    try {
      body = await request.json()
    } catch {
      // 忽略无效请求体
    }

    const limit = Math.min(Math.max(parseInt(body.limit, 10) || 30, 1), 60)
    const force = Boolean(body.force)

    const where = force ? '' : "WHERE icon IS NULL OR icon = ''"
    const { results } = await env.DB.prepare(
      `SELECT id, url FROM bookmarks ${where} ORDER BY id ASC LIMIT ?`
    ).bind(limit).all()

    const { results: remainRows } = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM bookmarks ${where}`
    ).all()

    if (results.length === 0) {
      return new Response(JSON.stringify({
        success: true, total: 0, updated: 0, failed: 0, remaining: 0, results: []
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const CONCURRENCY = 6
    const results2 = new Array(results.length)
    let cursor = 0

    const worker = async () => {
      while (cursor < results.length) {
        const index = cursor++
        const row = results[index]
        const icon = await resolveIcon(row.url)
        results2[index] = { id: row.id, url: row.url, icon, ok: Boolean(icon) }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, results.length) }, worker)
    )

    // 只写入成功解析到图标的记录
    const succeeded = results2.filter(r => r.ok)
    if (succeeded.length > 0) {
      await env.DB.batch(succeeded.map(r =>
        env.DB.prepare('UPDATE bookmarks SET icon = ? WHERE id = ?').bind(r.icon, r.id)
      ))
    }

    const updatedTotal = Number(remainRows?.[0]?.cnt ?? 0) - succeeded.length

    return new Response(JSON.stringify({
      success: true,
      total: results.length,
      updated: succeeded.length,
      failed: results2.length - succeeded.length,
      remaining: Math.max(updatedTotal, 0),
      results: results2
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('batch-fetch-icons error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

// 解析站点的最佳图标地址
async function resolveIcon(rawUrl) {
  let origin
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    origin = u.origin
  } catch {
    return null
  }

  // 1. 先尝试直接访问 /favicon.ico，确认确实存在且是图片
  const direct = `${origin}/favicon.ico`
  try {
    const res = await fetch(direct, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        Accept: 'image/*,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(6000)
    })
    const type = res.headers.get('Content-Type') || ''
    if (res.ok && type.startsWith('image/')) {
      // 读一小段，确保不是伪装成图片的 HTML 错误页
      const buf = await res.arrayBuffer()
      if (buf.byteLength > 100) return direct
    }
  } catch {
    // 忽略，走兜底
  }

  // 2. 兜底：第三方图标服务（DuckDuckGo 的图标接口，按域名返回 PNG）
  const host = new URL(origin).hostname
  return `https://icons.duckduckgo.com/ip3/${host}.ico`
}
