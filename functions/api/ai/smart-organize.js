import { callOpenAI, getAIConfig } from './_shared.js'

function extractJson(text) {
  if (!text) return null
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch (error) {
    return null
  }
}

const CHUNK_SIZE = 40

// POST /api/ai/smart-organize
// 智能分类：AI 分析全部书签，自动设计一套分类（复用已有分类 + 新建），并把每个书签归入最合适的分类
// 返回：{ success, assigned, failed, categoriesCreated, createdNames, categorySummary }
export async function onRequestPost(context) {
  const { env } = context

  try {
    const config = await getAIConfig(env)
    const db = env.DB

    // 1. 读取全部书签
    const { results: bookmarks } = await db
      .prepare('SELECT id, name, url, description FROM bookmarks ORDER BY id ASC')
      .all()

    if (!bookmarks || bookmarks.length === 0) {
      return new Response(JSON.stringify({ success: false, error: '没有书签可分类' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 2. 读取已有分类（带路径）
    const { results: categoryRows } = await db
      .prepare('SELECT id, name, parent_id, depth FROM categories ORDER BY depth ASC, position ASC')
      .all()

    const nameById = new Map(categoryRows.map(c => [c.id, c.name]))
    const existingPaths = categoryRows.map(c => {
      const path = []
      let cur = c
      while (cur) {
        path.unshift(cur.name)
        cur = cur.parent_id ? categoryRows.find(x => x.id === cur.parent_id) : null
      }
      return path.join(' / ')
    })

    // 3. 分块让 AI 设计分类并分配
    const assign = new Map() // bookmarkId -> categoryName (顶级分类名)
    let failed = 0

    for (let i = 0; i < bookmarks.length; i += CHUNK_SIZE) {
      const chunk = bookmarks.slice(i, i + CHUNK_SIZE)
      const listText = chunk
        .map(b => `${b.id}. ${b.name} | ${b.url}${b.description ? ' | ' + b.description.slice(0, 80) : ''}`)
        .join('\n')

      const prompt = `You are organizing website bookmarks. Below is a list of bookmarks (format: id. name | url | description).

${listText}

${existingPaths.length ? `Existing categories (reuse these when suitable):\n${existingPaths.join('\n')}\n` : ''}
Task:
1. Design a concise set of top-level categories for ALL these bookmarks. Use short names (2-6 Chinese characters) in the same language as the bookmarks. Usually 5-12 categories is enough. Reuse existing categories where suitable, create new ones only when needed. Do NOT use "未分类" as a category.
2. Assign EVERY bookmark id (the number before the dot) to exactly one category name.

Respond with ONLY a JSON object in this exact format:
{"categories":["分类1","分类2"],"assign":{"12":"分类1","13":"分类2"}}`

      try {
        const response = await callOpenAI(env, {
          path: 'chat/completions',
          method: 'POST',
          body: {
            model: config.model,
            messages: [
              { role: 'system', content: 'You output only valid JSON. No markdown, no explanation.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.2,
            max_tokens: 2000
          }
        })

        const data = await response.json()
        const parsed = extractJson(data.choices?.[0]?.message?.content)

        if (parsed && typeof parsed.assign === 'object') {
          for (const [id, catName] of Object.entries(parsed.assign)) {
            const bid = Number.parseInt(id, 10)
            if (Number.isInteger(bid) && typeof catName === 'string' && catName.trim()) {
              assign.set(bid, catName.trim().slice(0, 20))
            }
          }
        }
      } catch (error) {
        console.error('Smart organize chunk error:', error)
      }

      // 避免触发 API 速率限制
      if (i + CHUNK_SIZE < bookmarks.length) {
        await new Promise(resolve => setTimeout(resolve, 400))
      }
    }

    if (assign.size === 0) {
      return new Response(JSON.stringify({ success: false, error: 'AI 未能生成分类方案，请稍后重试' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 4. 创建缺失的分类（顶级）
    const usedNames = [...new Set(assign.values())]
    const existingNames = new Set(
      categoryRows.filter(c => c.depth === 0).map(c => c.name)
    )
    const toCreate = usedNames.filter(n => !existingNames.has(n))

    let created = 0
    const createdNames = []
    for (const name of toCreate) {
      try {
        const res = await db
          .prepare('INSERT INTO categories (name, position, parent_id, depth) VALUES (?, (SELECT COALESCE(MAX(position), -1) + 1 FROM categories WHERE parent_id IS NULL), NULL, 0)')
          .bind(name)
          .run()
        nameById.set(res.meta.last_row_id, name)
        created++
        createdNames.push(name)
      } catch (error) {
        // 同名唯一约束冲突等，尝试查回
        const row = await db
          .prepare('SELECT id FROM categories WHERE name = ? AND parent_id IS NULL LIMIT 1')
          .bind(name)
          .first()
        if (row) nameById.set(row.id, name)
      }
    }

    // id -> name 索引（含新建的）
    const { results: allCats } = await db
      .prepare('SELECT id, name, depth FROM categories')
      .all()
    const topByName = new Map(
      allCats.filter(c => c.depth === 0).map(c => [c.name, c.id])
    )

    // 5. 批量写回书签分类（顶级分类；书签原在其他子分类也统一归到对应顶级）
    const updates = []
    for (const [bid, catName] of assign) {
      const cid = topByName.get(catName)
      if (cid) {
        updates.push(
          db.prepare('UPDATE bookmarks SET category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(cid, bid)
        )
      }
    }
    if (updates.length > 0) {
      await db.batch(updates)
    }

    // 6. 汇总各分类书签数
    const { results: summaryRows } = await db
      .prepare(`SELECT c.name, COUNT(b.id) AS cnt
                FROM categories c LEFT JOIN bookmarks b ON b.category_id = c.id
                WHERE c.depth = 0
                GROUP BY c.id ORDER BY cnt DESC`)
      .all()

    return new Response(JSON.stringify({
      success: true,
      total: bookmarks.length,
      assigned: updates.length,
      failed: bookmarks.length - updates.length,
      categoriesCreated: created,
      createdNames,
      categorySummary: summaryRows.map(r => ({ name: r.name, count: r.cnt }))
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Smart organize error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || '智能分类失败'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
