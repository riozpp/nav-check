import { callOpenAI, joinBaseUrl } from './_shared.js'

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export async function onRequestPost(context) {
  const { request, env } = context

  try {
    const payload = await request.json()
    const { path, method = 'POST', headers = {}, body, query } = payload

    if (!path || typeof path !== 'string') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing path'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (path.includes('://')) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Path must be relative to the configured base URL'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    let finalPath = path
    if (query && isObject(query)) {
      const searchParams = new URLSearchParams()
      Object.entries(query).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach(item => searchParams.append(key, String(item)))
        } else if (value !== undefined && value !== null) {
          searchParams.append(key, String(value))
        }
      })
      const queryString = searchParams.toString()
      if (queryString) {
        const separator = finalPath.includes('?') ? '&' : '?'
        finalPath = `${finalPath}${separator}${queryString}`
      }
    }

    const response = await callOpenAI(env, {
      path: finalPath,
      method,
      headers,
      body
    })

    const responseHeaders = new Headers(response.headers)
    responseHeaders.set('Access-Control-Expose-Headers', '*')

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    })
  } catch (error) {
    console.error('AI proxy error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'AI proxy request failed'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
