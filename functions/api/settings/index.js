// GET all settings
export async function onRequestGet(context) {
  const { env } = context;
  
  try {
    const { results } = await env.DB.prepare(
      'SELECT key, value FROM settings ORDER BY key'
    ).all();
    
    // 转换为对象格式
    const settings = {};
    results.forEach(row => {
      if (row.key?.startsWith('secret_')) {
        return;
      }
      settings[row.key] = row.value;
    });
    
    return new Response(JSON.stringify({
      success: true,
      data: settings
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch settings' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// POST update settings
export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { settings } = await request.json();
    
    if (!settings || typeof settings !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid settings data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 批量更新设置
    const statements = Object.entries(settings).map(([key, value]) => 
      env.DB.prepare(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
      ).bind(key, value)
    );
    
    await env.DB.batch(statements);
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Settings API Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to update settings',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
