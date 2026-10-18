import { getAIConfig } from './_shared.js'

export async function onRequestGet(context) {
  const { env } = context;
  
  try {
    const config = await getAIConfig(env)
    const hasEnvKey = !!env.OPENAI_API_KEY
    
    let hasDbKey = false
    if (!hasEnvKey) {
      const result = await env.DB.prepare(
        'SELECT value FROM settings WHERE key = ?'
      ).bind('secret_openai_api_key').first()
      
      hasDbKey = !!result?.value
    }
    
    const enabled = !!config.apiKey
    
    return new Response(JSON.stringify({
      success: true,
      enabled,
      source: hasEnvKey ? 'env' : (hasDbKey ? 'db' : 'none'),
      baseUrl: config.baseUrl,
      model: config.model
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false,
      enabled: false,
      error: 'Failed to check AI status' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
