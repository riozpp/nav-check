import { isValidHttpUrl, repairUrl } from './_url-utils.js'

// GET  /api/bookmarks/clean-urls  → 扫描畸形 URL，返回可修复建议
// POST /api/bookmarks/clean-urls  → 批量应用修复
//   { items: [{ id, url }] }
export async function onRequestGet(context) {
  const { env } = context
  try {
    const { results } = await env.DB.prepare(
      'SELECT id, name, url FROM bookmarks ORDER BY id ASC'
    ).all()

    const issues = []
    for (const row of results) {
      if (isValidHttpUrl(row.url)) continue
      const fixed = repairUrl(row.url)
      issues.push({
        id: row.id,
        name: row.name,
        url: row.url,
        suggested: fixed ? fixed.url : null,
        reason: fixed ? fixed.reason : '无法自动修复，建议手动修正或删除'
      })
    }

    return new Response(JSON.stringify({
      success: true,
      total: results.length,
      issues,
      fixable: issues.filter(i => i.suggested).length
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('clean-urls GET error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const { items } = await request.json()
    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: '缺少待修复列表' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const valid = items.filter(it => it?.id && isValidHttpUrl(it.url))
    if (valid.length === 0) {
      return new Response(JSON.stringify({ error: '没有可修复的合法 URL' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    await env.DB.batch(valid.map(it =>
      env.DB.prepare(
        'UPDATE bookmarks SET url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(it.url.trim(), it.id)
    ))

    return new Response(JSON.stringify({ success: true, updated: valid.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('clean-urls POST error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
