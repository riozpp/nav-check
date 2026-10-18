import { callOpenAI, getAIConfig } from './_shared.js'

function extractJson(text) {
  if (!text) return null
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

function isHttpUrl(value) {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// POST /api/ai/repair-link
// 对失效书签给出替代链接与网页存档地址（需要登录，且已配置 AI）
export async function onRequestPost(context) {
  const { request, env } = context

  try {
    const { title, url, description } = await request.json()

    if (!title || !url || !isHttpUrl(url)) {
      return new Response(JSON.stringify({ success: false, error: '参数无效' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const config = await getAIConfig(env)
    if (!config.apiKey) {
      return new Response(JSON.stringify({
        success: false,
        error: '未配置 AI，请先在设置中填写 API Key'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const prompt = `请以 JSON 格式返回，不要包含其他内容：
{
  "alternative": "推断的新链接（无法推断则为 null）",
  "wayback": "该链接的 Wayback Machine 存档地址",
  "reason": "一句话说明原因"
}

书签标题：${title}
原链接：${url}
${description ? `原描述：${description}` : ''}`

    const response = await callOpenAI(env, {
      path: 'chat/completions',
      method: 'POST',
      body: {
        model: config.model,
        messages: [
          {
            role: 'system',
            content: '你是死链修复助手。给定已失效的书签，请推断最可能的有效替代链接，并给出网页存档地址。'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 300
      }
    })

    const data = await response.json()
    const parsed = extractJson(data.choices?.[0]?.message?.content)

    if (!parsed) {
      return new Response(JSON.stringify({ success: false, error: 'AI 返回内容无法解析' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // AI 输出不可信（幻觉或页面注入），强制校验协议，防止 javascript: 等危险链接
    const alternative = parsed.alternative && isHttpUrl(parsed.alternative)
      ? parsed.alternative
      : null
    const wayback = parsed.wayback && isHttpUrl(parsed.wayback)
      ? parsed.wayback
      : `https://web.archive.org/web/2024/${url}`

    return new Response(JSON.stringify({
      success: true,
      alternative,
      wayback,
      reason: parsed.reason || ''
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('AI repair-link error:', error)
    return new Response(JSON.stringify({ success: false, error: 'AI 修复失败：' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
