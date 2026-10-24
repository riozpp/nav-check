// POST /api/ai/smart-organize/apply
// 前端完成全部分块分析后，把汇总结果 { "<书签id>": "分类名" } 提交过来：
// 1. 创建缺失的顶级分类  2. batch 写回书签分类  3. 返回汇总
// 请求体：{ assign: { "12": "开发工具", ... } }
export async function onRequestPost(context) {
  const { request, env } = context

  try {
    const { assign } = await request.json()

    if (!assign || typeof assign !== 'object' || Object.keys(assign).length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Missing assign data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const db = env.DB
    const usedNames = [...new Set(Object.values(assign).map(n => String(n).trim().slice(0, 20)).filter(Boolean))]

    // 现有顶级分类
    const { results: topRows } = await db
      .prepare('SELECT id, name FROM categories WHERE depth = 0')
      .all()
    const topByName = new Map(topRows.map(c => [c.name, c.id]))

    // 创建缺失的分类
    let created = 0
    const createdNames = []
    for (const name of usedNames) {
      if (topByName.has(name)) continue
      try {
        const res = await db
          .prepare('INSERT INTO categories (name, position, parent_id, depth) VALUES (?, (SELECT COALESCE(MAX(position), -1) + 1 FROM categories WHERE parent_id IS NULL), NULL, 0)')
          .bind(name)
          .run()
        topByName.set(name, res.meta.last_row_id)
        created++
        createdNames.push(name)
      } catch (error) {
        const row = await db
          .prepare('SELECT id FROM categories WHERE name = ? AND parent_id IS NULL LIMIT 1')
          .bind(name)
          .first()
        if (row) topByName.set(name, row.id)
      }
    }

    // batch 写回书签
    const updates = []
    for (const [bid, name] of Object.entries(assign)) {
      const id = Number.parseInt(bid, 10)
      const cid = topByName.get(String(name).trim().slice(0, 20))
      if (Number.isInteger(id) && cid) {
        updates.push(
          db.prepare('UPDATE bookmarks SET category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(cid, id)
        )
      }
    }
    if (updates.length > 0) {
      await db.batch(updates)
    }

    // 各分类书签数汇总
    const { results: summaryRows } = await db
      .prepare(`SELECT c.name, COUNT(b.id) AS cnt
                FROM categories c LEFT JOIN bookmarks b ON b.category_id = c.id
                WHERE c.depth = 0
                GROUP BY c.id ORDER BY cnt DESC`)
      .all()

    return new Response(JSON.stringify({
      success: true,
      assigned: updates.length,
      categoriesCreated: created,
      createdNames,
      categorySummary: summaryRows.map(r => ({ name: r.name, count: r.cnt }))
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Smart organize apply error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || '写入失败'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
