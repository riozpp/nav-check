import { callOpenAI, getAIConfig } from './_shared.js'

function extractJson(text) {
  if (!text) return null
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return ''
  return value
    .map(t => String(t).trim().replace(/^#/, ''))
    .filter(t => t && t.length <= 12)
    .slice(0, 5)
    .join(',')
}

// POST /api/ai/batch-generate-tags
// 批量为书签生成标签，返回结果由前端确认后再写库
// 请求体: { bookmarks: [{ id, name, url, description }] }
export async function onRequestPost(context) {
  const { request, env } = context

  try {
    const { bookmarks } = await request.json()

    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
      return new Response(JSON.stringify({ success: false, error: '缺少书签数据' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const config = await getAIConfig(env)
    if (!config.apiKey) {
      return new Response(JSON.stringify({ success: false, error: '未配置 AI，请先在设置中填写 API Key' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 一次性处理整批，节省 token 与请求数
    const list = bookmarks.map((b, i) =>
      `${i + 1}. 名称：${b.name}\n   URL：${b.url}${b.description ? `\n   描述：${b.description}` : ''}`
    ).join('\n')

    const prompt = `下面是 ${bookmarks.length} 个书签，请为每一个生成 1-4 个中文标签。

要求：
- 标签要简短（2-6 个汉字），能体现网站类型/用途/领域
- 使用常见的通用词汇，不要生造词
- 不要包含编号、书名号或标点
- 优先复用已有标签概念，保持全库一致

书签列表：
${list}

请只返回 JSON 数组，格式为：
[{"index": 1, "tags": ["标签1", "标签2"]}, ...]`

    const response = await callOpenAI(env, {
      path: 'chat/completions',
      method: 'POST',
      body: {
        model: config.model,
        messages: [
          {
            role: 'system',
            content: '你是一个书签标签生成助手，擅长提炼网站的核心用途作为简洁中文标签。'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: Math.min(2000, 120 * bookmarks.length)
      }
    })

    const data = await response.json()
    const parsed = extractJson(data.choices?.[0]?.message?.content)

    if (!Array.isArray(parsed)) {
      return new Response(JSON.stringify({ success: false, error: 'AI 返回内容无法解析' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const results = parsed
      .map(item => {
        const idx = parseInt(item?.index, 10)
        const bookmark = bookmarks[idx - 1]
        if (!bookmark) return null
        const tags = normalizeTags(item?.tags)
        if (!tags) return null
        return { id: bookmark.id, name: bookmark.name, tags }
      })
      .filter(Boolean)

    return new Response(JSON.stringify({
      success: true,
      total: bookmarks.length,
      generated: results.length,
      results
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('batch-generate-tags error:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
