const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'

async function fetchSettings(env, keys) {
  if (!keys.length) return {}
  const placeholders = keys.map(() => '?').join(', ')
  const statement = `SELECT key, value FROM settings WHERE key IN (${placeholders})`
  const values = await env.DB.prepare(statement).bind(...keys).all()
  const map = {}
  values.results.forEach(row => {
    map[row.key] = row.value
  })
  return map
}

export async function getAIConfig(env) {
  const settings = await fetchSettings(env, [
    'secret_openai_api_key',
    'ai_base_url',
    'ai_model',
    'ai_auth_header',
    'ai_auth_prefix'
  ])

  const apiKey = env.OPENAI_API_KEY || settings.secret_openai_api_key || ''
  const baseUrl = (env.OPENAI_BASE_URL || settings.ai_base_url || DEFAULT_BASE_URL).trim()
  const model = (env.OPENAI_MODEL || settings.ai_model || DEFAULT_MODEL).trim()
  const authHeader = (env.OPENAI_AUTH_HEADER || settings.ai_auth_header || 'Authorization').trim()
  const authPrefix = env.OPENAI_AUTH_PREFIX !== undefined
    ? env.OPENAI_AUTH_PREFIX
    : (settings.ai_auth_prefix !== undefined ? settings.ai_auth_prefix : 'Bearer ')

  return {
    apiKey,
    baseUrl,
    model,
    authHeader,
    authPrefix
  }
}

export function joinBaseUrl(baseUrl, path) {
  if (!path) {
    throw new Error('Missing OpenAI path')
  }
  if (path.includes('://')) {
    throw new Error('Path must be relative when using proxy')
  }

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path
  return normalizedBase + normalizedPath
}

export async function callOpenAI(env, { path, method = 'POST', body, headers = {} }) {
  const config = await getAIConfig(env)

  if (!config.apiKey) {
    throw new Error('Missing OpenAI API key')
  }

  const url = joinBaseUrl(config.baseUrl, path)

  const finalHeaders = new Headers(headers)
  if (!finalHeaders.has(config.authHeader)) {
    finalHeaders.set(config.authHeader, `${config.authPrefix || ''}${config.apiKey}`)
  }

  if (body && !(body instanceof ReadableStream) && typeof body === 'object' && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json')
    body = JSON.stringify(body)
  }

  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body instanceof ReadableStream ? body : body ?? undefined
  })

  if (!response.ok) {
    let details = ''
    try {
      const errorData = await response.json()
      details = errorData.error?.message || errorData.error || JSON.stringify(errorData)
    } catch (err) {
      details = await response.text()
    }

    throw new Error(details || `OpenAI request failed with status ${response.status}`)
  }

  return response
}
