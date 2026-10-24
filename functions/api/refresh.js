// POST /api/refresh
// Token 滑动续期：校验当前 token（未过期）后，签发一个同类型的新 token
// 供前端在 401 时自动调用，避免长耗时操作（如 AI 智能分类）中途登录过期
export async function onRequestPost(context) {
  const { request, env } = context

  try {
    const authHeader = request.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      })
    }
    const oldToken = authHeader.substring(7)
    const parts = oldToken.split('.')
    if (parts.length !== 3 && parts.length !== 2) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid token' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      })
    }

    // 兼容新旧格式
    let timestamp, tokenType, hash
    if (parts.length === 3) {
      [timestamp, tokenType, hash] = parts
    } else {
      [timestamp, hash] = parts
      tokenType = 'short'
    }

    // 未过期校验（与中间件同一套规则）
    const tokenTime = parseInt(timestamp)
    const expiryTime = tokenType === 'long' ? 30 * 24 * 60 * 60 * 1000 : 15 * 60 * 1000
    if (!Number.isFinite(tokenTime) || Date.now() - tokenTime > expiryTime) {
      return new Response(JSON.stringify({ success: false, error: 'Token expired' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      })
    }

    // 哈希校验
    const tokenData = timestamp + '_' + tokenType + '_' + env.JWT_SECRET
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(tokenData))
    const expectedHash = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
    if (hash !== expectedHash) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid token' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      })
    }

    // 签发新 token（保持相同类型：short 15 分钟 / long 30 天）
    const newTimestamp = Date.now()
    const newData = newTimestamp + '_' + tokenType + '_' + env.JWT_SECRET
    const newHashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(newData))
    const newHash = btoa(String.fromCharCode(...new Uint8Array(newHashBuffer)))
    const newToken = newTimestamp + '.' + tokenType + '.' + newHash

    return new Response(JSON.stringify({ success: true, token: newToken, tokenType }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message || 'Refresh failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
}
