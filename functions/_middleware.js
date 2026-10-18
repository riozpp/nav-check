// Token 验证辅助函数
async function validateToken(token, env) {
  try {
    const parts = token.split('.');
    
    // 支持新格式（timestamp.type.hash）和旧格式（timestamp.hash）
    let timestamp, tokenType, hash;
    
    if (parts.length === 3) {
      // 新格式：timestamp.type.hash
      [timestamp, tokenType, hash] = parts;
    } else if (parts.length === 2) {
      // 旧格式（兼容性）：timestamp.hash
      [timestamp, hash] = parts;
      tokenType = 'short'; // 默认为短期token
    } else {
      return { valid: false, error: 'Invalid token format' };
    }
    
    const tokenTime = parseInt(timestamp);
    const now = Date.now();
    
    // 根据token类型设置有效期
    const expiryTime = tokenType === 'long' 
      ? 30 * 24 * 60 * 60 * 1000  // 30天
      : 15 * 60 * 1000;            // 15分钟
    
    // 检查token是否过期
    if (now - tokenTime > expiryTime) {
      return { valid: false, error: 'Token expired' };
    }
    
    // 验证hash
    const tokenData = timestamp + '_' + tokenType + '_' + env.JWT_SECRET;
    const encoder = new TextEncoder();
    const data = encoder.encode(tokenData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const expectedHash = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
    
    if (hash !== expectedHash) {
      return { valid: false, error: 'Invalid token' };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid token format' };
  }
}

// JWT验证中间件
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  
  // 添加安全响应头
  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
  };
  
  // 登录接口不需要验证
  if (url.pathname === '/api/login') {
    return await next();
  }
  
  // GET请求的bookmarks、categories、settings和AI状态不需要登录即可访问（只读）
  if (request.method === 'GET' && 
      (url.pathname === '/api/bookmarks' || 
       url.pathname === '/api/categories' ||
       url.pathname === '/api/fetch-metadata' ||
       url.pathname === '/api/settings' ||
       url.pathname === '/api/ai/status')) {
    return await next();
  }
  
  // settings API 的 POST 请求需要认证（修改设置）
  if (url.pathname === '/api/settings' && request.method === 'POST') {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const token = authHeader.substring(7);
    const validation = await validateToken(token, env);
    
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  // 其他API需要验证token
  if (url.pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const token = authHeader.substring(7);
    const validation = await validateToken(token, env);
    
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  const response = await next();
  
  // 添加安全头到响应
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  return response;
}

