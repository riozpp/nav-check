import { getAIConfig, joinBaseUrl } from './_shared.js'

// POST /api/ai/diagnose
// AI 配置全面自检：连通性 → 模型列表 → 模型是否可用 → 实际对话测试
// 请求体（均可选，不传则用已保存的配置，便于"保存前先测一下"）：
//   { apiKey, baseUrl, model, authHeader, authPrefix }
// 返回每一步的结果，前端可逐步展示
export async function onRequestPost(context) {
  const { request, env } = context

  try {
    let body = {}
    try {
      body = await request.json()
    } catch {
      // 无请求体，使用已保存配置
    }

    // 未显式传入的字段，回落到数据库/环境变量中的已保存配置
    const saved = await getAIConfig(env)
    const apiKey = body.apiKey || saved.apiKey
    const baseUrl = (body.baseUrl || saved.baseUrl || 'https://api.openai.com/v1').trim()
    const model = (body.model || saved.model || 'gpt-4o-mini').trim()
    const authHeader = (body.authHeader || saved.authHeader || 'Authorization').trim()
    const authPrefix = body.authPrefix !== undefined
      ? body.authPrefix
      : (saved.authPrefix !== undefined ? saved.authPrefix : 'Bearer ')

    if (!apiKey) {
      return new Response(JSON.stringify({
        success: false,
        stage: 'config',
        error: '未配置 API Key'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const steps = []
    const headers = new Headers()
    headers.set(authHeader, `${authPrefix || ''}${apiKey}`)
    headers.set('Content-Type', 'application/json')

    // ---------- 步骤 1：连通性 + 模型列表 ----------
    let modelList = []
    let modelsEndpointOk = false
    try {
      const url = joinBaseUrl(baseUrl, 'models')
      const res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(15000) })

      if (res.ok) {
        modelsEndpointOk = true
        const data = await res.json().catch(() => ({}))
        const list = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : [])
        modelList = list
          .map(m => (typeof m === 'string' ? m : m.id))
          .filter(Boolean)
          .sort()
        steps.push({
          stage: 'connect',
          ok: true,
          message: `接口连通正常，返回 ${modelList.length} 个可用模型`
        })
      } else if (res.status === 401 || res.status === 403) {
        steps.push({
          stage: 'connect',
          ok: false,
          message: `认证失败（HTTP ${res.status}），请检查 API Key / 认证 Header 与前缀`
        })
        return respond({ success: false, steps, modelList, modelExists: null })
      } else {
        // 部分兼容服务没有 /models 端点，不算致命错误，继续做对话测试
        steps.push({
          stage: 'connect',
          ok: true,
          warning: true,
          message: `该服务未提供模型列表（HTTP ${res.status}），将直接进行对话测试`
        })
      }
    } catch (error) {
      const msg = String(error?.message || error)
      if (/timeout|abort/i.test(msg)) {
        steps.push({ stage: 'connect', ok: false, message: '连接超时，请检查 Base URL 是否正确、网络是否可达' })
        return respond({ success: false, steps, modelList, modelExists: null })
      }
      steps.push({ stage: 'connect', ok: false, message: '连接失败：' + msg })
      return respond({ success: false, steps, modelList, modelExists: null })
    }

    // ---------- 步骤 2：模型是否在列表中 ----------
    let modelExists = null
    if (modelsEndpointOk && modelList.length > 0) {
      modelExists = modelList.includes(model)
      steps.push({
        stage: 'model',
        ok: modelExists,
        message: modelExists
          ? `模型 "${model}" 存在`
          : `模型 "${model}" 不在返回的模型列表中（可能是别名或该服务未完整列出）`,
        ...(modelExists ? {} : { suggestions: modelList.slice(0, 12) })
      })
    }

    // ---------- 步骤 3：实际发起一次极小的对话请求 ----------
    const startedAt = Date.now()
    try {
      const url = joinBaseUrl(baseUrl, 'chat/completions')
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: '回复"ok"两个字符即可' }],
          max_tokens: 8,
          temperature: 0
        }),
        signal: AbortSignal.timeout(30000)
      })

      const elapsed = Date.now() - startedAt

      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const reply = data.choices?.[0]?.message?.content ?? ''
        steps.push({
          stage: 'chat',
          ok: true,
          message: `模型响应正常（${elapsed}ms）`,
          reply: String(reply).trim().slice(0, 60),
          usage: data.usage || null
        })
        return respond({ success: true, steps, modelList, modelExists, model, baseUrl })
      }

      // 解析错误详情，给出可操作的建议
      let detail = ''
      let code = ''
      try {
        const errData = await res.json()
        detail = errData.error?.message || errData.message || ''
        code = errData.error?.code || errData.error?.type || ''
      } catch {
        detail = await res.text().catch(() => '')
      }

      let hint = ''
      if (res.status === 401 || res.status === 403) {
        hint = 'API Key 无效或无权限'
      } else if (res.status === 404) {
        hint = '模型不存在或 Base URL 路径不对（需以 /v1 结尾）'
      } else if (res.status === 429) {
        hint = '请求频率或额度超限'
      } else if (res.status === 400) {
        hint = '请求参数被拒绝，常见原因是模型名错误或该模型不支持对话接口'
      } else if (res.status >= 500) {
        hint = 'AI 服务端异常，请稍后重试'
      }

      steps.push({
        stage: 'chat',
        ok: false,
        status: res.status,
        message: `模型调用失败（HTTP ${res.status}）${hint ? '：' + hint : ''}`,
        detail: String(detail).slice(0, 300),
        code
      })
      return respond({ success: false, steps, modelList, modelExists, model, baseUrl })
    } catch (error) {
      const msg = String(error?.message || error)
      const timeout = /timeout|abort/i.test(msg)
      steps.push({
        stage: 'chat',
        ok: false,
        message: timeout
          ? '模型响应超时（30 秒），该模型可能过载或 Base URL 不可用'
          : '调用失败：' + msg
      })
      return respond({ success: false, steps, modelList, modelExists, model, baseUrl })
    }
  } catch (error) {
    console.error('ai diagnose error:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

function respond(payload) {
  return new Response(JSON.stringify({
    success: payload.success,
    steps: payload.steps || [],
    modelList: (payload.modelList || []).slice(0, 100),
    modelExists: payload.modelExists ?? null,
    model: payload.model || null,
    baseUrl: payload.baseUrl || null
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
