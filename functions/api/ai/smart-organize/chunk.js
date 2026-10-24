import { callOpenAI, getAIConfig } from '../_shared.js'

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

// POST /api/ai/smart-organize/chunk
// 处理一批书签（约 24 个），单次请求很快返回，避免边缘网络 100s 超时
// 请求体：{ bookmarks: [{id,name,url,description}], existingCategories: ["路径",...], knownCategories: ["分类名",...] }
// knownCategories 是前面批次已经产生/已存在的分类名，要求 AI 优先原样复用，避免每批各建一套造成重复
// 返回：{ success, categories: ["新分类名"...], assign: { "<书签id>": "分类名" } }
export async function onRequestPost(context) {
  const { request, env } = context

  try {
    const { bookmarks, existingCategories, knownCategories } = await request.json()

    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Missing bookmarks' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const config = await getAIConfig(env)

    const listText = bookmarks
      .map(b => `${b.id}. ${b.name} | ${b.url}${b.description ? ' | ' + String(b.description).slice(0, 80) : ''}`)
      .join('\n')

    const knownList = Array.isArray(knownCategories) ? knownCategories.filter(n => typeof n === 'string' && n.trim()) : []
    const knownText = knownList.length
      ? `\nCategory names already in use (MUST reuse one of these EXACT names whenever suitable; only create a genuinely new category when none fits; avoid near-synonyms of existing names):\n${knownList.join('、')}\n`
      : ''
    const existingText = Array.isArray(existingCategories) && existingCategories.length
      ? `\nExisting categories (full paths, reuse when suitable):\n${existingCategories.join('\n')}\n`
      : ''

    const prompt = `You are organizing website bookmarks. Below is a list of bookmarks (format: id. name | url | description).

${listText}
${existingText}${knownText}
Task:
1. The final set of categories across ALL batches should be concise (ideally 8-15 total). Use short names (2-6 Chinese characters) in the same language as the bookmarks. Reuse existing/known category names as much as possible. Do NOT use "未分类" as a category.
2. Assign EVERY bookmark id (the number before the dot) to exactly one category name.

Respond with ONLY a JSON object in this exact format:
{"categories":["分类1","分类2"],"assign":{"12":"分类1","13":"分类2"}}`

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
            // 推理模型（如 deepseek-flash/reasoner）会先消耗大量 token 思考，
            // 配额太小会导致答案被截断甚至为空，必须给足
            max_tokens: 8000
      }
    })

    const data = await response.json()
    const parsed = extractJson(data.choices?.[0]?.message?.content)

    if (!parsed || typeof parsed.assign !== 'object' || !parsed.assign) {
      return new Response(JSON.stringify({ success: false, error: 'AI 返回格式异常，请重试' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 清洗结果：只保留能解析的整数 id 与有效分类名
    const assign = {}
    const names = new Set(Array.isArray(parsed.categories) ? parsed.categories : [])
    for (const [id, catName] of Object.entries(parsed.assign)) {
      const bid = Number.parseInt(id, 10)
      if (Number.isInteger(bid) && typeof catName === 'string' && catName.trim()) {
        const name = catName.trim().slice(0, 20)
        assign[bid] = name
        names.add(name)
      }
    }

    if (Object.keys(assign).length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'AI 未能分配该批书签，请重试' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      success: true,
      categories: [...names],
      assign
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Smart organize chunk error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || '处理失败'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
