// POST /api/categories/clear-all
// 清除所有分类，但保留全部书签：
// 1. 创建（或复用）一个顶级「未分类」兜底分类
// 2. 把所有书签挪进去
// 3. 删除其余所有分类
export async function onRequestPost(context) {
  const { env } = context

  try {
    const db = env.DB

    // 查找或创建「未分类」
    let fallback = await db
      .prepare('SELECT id FROM categories WHERE name = ? AND parent_id IS NULL LIMIT 1')
      .bind('未分类')
      .first()

    if (!fallback) {
      const res = await db
        .prepare('INSERT INTO categories (name, position, parent_id, depth) VALUES (?, 0, NULL, 0)')
        .bind('未分类')
        .run()
      fallback = { id: res.meta.last_row_id }
    }
    const fallbackId = fallback.id

    // 统计书签总数并把它们全部挪到「未分类」
    const { results: countRows } = await db
      .prepare('SELECT COUNT(*) AS cnt FROM bookmarks')
      .all()
    const total = countRows?.[0]?.cnt ?? 0

    await db
      .prepare('UPDATE bookmarks SET category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE category_id != ?')
      .bind(fallbackId, fallbackId)
      .run()

    // 删除「未分类」以外的所有分类（此时已没有书签挂在它们下面）
    await db
      .prepare('DELETE FROM categories WHERE id != ?')
      .bind(fallbackId)
      .run()

    const { results: leftRows } = await db
      .prepare('SELECT COUNT(*) AS cnt FROM categories')
      .all()

    return new Response(JSON.stringify({
      success: true,
      fallbackId,
      bookmarksKept: total,
      categoriesLeft: leftRows?.[0]?.cnt ?? 1
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Clear all categories error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || '清除分类失败'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
