import { isValidHttpUrl } from './_url-utils.js'

// POST /api/bookmarks/batch-replace-url
// 按「查找-替换」批量修改书签 URL（例如 NAS IP 变化时批量改主机名）
// 请求体: { find: string, replace: string, dryRun?: boolean }
//   find    要查找的子串（普通字符串，非正则）
//   replace 替换为的字符串
//   dryRun  为 true 时只返回将要修改的记录，不写库
export async function onRequestPost(context) {
  const { request, env } = context

  try {
    const { find, replace, dryRun } = await request.json()

    if (!find || typeof find !== 'string') {
      return new Response(JSON.stringify({ error: '请提供要查找的内容' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const { results } = await env.DB.prepare(
      'SELECT id, name, url FROM bookmarks ORDER BY id ASC'
    ).all()

    const matches = []
    for (const row of results) {
      if (!row.url || !row.url.includes(find)) continue
      const next = row.url.split(find).join(replace ?? '')
      matches.push({
        id: row.id,
        name: row.name,
        before: row.url,
        after: next,
        valid: isValidHttpUrl(next)
      })
    }

    if (dryRun) {
      return new Response(JSON.stringify({
        success: true,
        dryRun: true,
        matched: matches.length,
        matches
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // 只写入替换后仍合法的记录，避免把正常 URL 改坏
    const writable = matches.filter(m => m.valid)
    if (writable.length > 0) {
      await env.DB.batch(writable.map(m =>
        env.DB.prepare(
          'UPDATE bookmarks SET url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(m.after, m.id)
      ))
    }

    return new Response(JSON.stringify({
      success: true,
      matched: matches.length,
      updated: writable.length,
      skipped: matches.length - writable.length,
      matches
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('batch-replace-url error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
