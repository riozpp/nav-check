// GET all categories with tree structure
export async function onRequestGet(context) {
  const { env, request } = context;
  
  try {
    // 检查是否已登录
    const authHeader = request.headers.get('Authorization');
    const isAuthenticated = authHeader && authHeader.startsWith('Bearer ');
    
    // 获取 publicMode 设置
    const publicModeSetting = await env.DB.prepare(
      'SELECT value FROM settings WHERE key = ?'
    ).bind('publicMode').first();
    
    const publicMode = publicModeSetting?.value !== 'false';
    
    // 如果是非公开模式且未登录，返回空数组
    if (!publicMode && !isAuthenticated) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 获取所有分类（包含parent_id和depth）
    // 如果未登录，过滤掉私密分类
    let query = 'SELECT * FROM categories';
    if (!isAuthenticated) {
      query += ' WHERE is_private = 0';
    }
    query += ' ORDER BY depth, position';
    
    const { results } = await env.DB.prepare(query).all();
    
    return new Response(JSON.stringify({ data: results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch categories' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// POST create category (with optional parent_id for nested structure)
export async function onRequestPost(context) {
  const { request, env } = context;
  let name, parent_id;
  
  try {
    const body = await request.json();
    name = body.name;
    parent_id = body.parent_id;
    const is_private = body.is_private;
    
    // 计算depth
    let depth = 0;
    if (parent_id) {
      const parent = await env.DB.prepare(
        'SELECT depth FROM categories WHERE id = ?'
      ).bind(parent_id).first();
      
      if (!parent) {
        return new Response(JSON.stringify({ error: 'Parent category not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      depth = parent.depth + 1;
      
      // 限制嵌套深度
      if (depth > 5) {
        return new Response(JSON.stringify({ error: 'Maximum nesting depth (5) exceeded' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // 检查同一父分类下是否已存在同名分类
    const checkWhereClause = parent_id ? 'WHERE name = ? AND parent_id = ?' : 'WHERE name = ? AND parent_id IS NULL';
    const checkQuery = `SELECT id FROM categories ${checkWhereClause}`;
    const existingCategory = parent_id
      ? await env.DB.prepare(checkQuery).bind(name, parent_id).first()
      : await env.DB.prepare(checkQuery).bind(name).first();
    
    if (existingCategory) {
      const parentText = parent_id ? '该父分类下' : '根目录下';
      return new Response(JSON.stringify({ 
        error: `分类"${name}"已存在于${parentText}，请使用其他名称` 
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 获取同一父分类下的最大position
    const whereClause = parent_id ? 'WHERE parent_id = ?' : 'WHERE parent_id IS NULL';
    const query = `SELECT COALESCE(MAX(position), -1) as position FROM categories ${whereClause}`;
    const { position: maxPosition } = parent_id 
      ? await env.DB.prepare(query).bind(parent_id).first()
      : await env.DB.prepare(query).first();
    
    const newPosition = (maxPosition || -1) + 1;
    
    const isPrivate = is_private ? 1 : 0;
    
    const result = await env.DB.prepare(
      'INSERT INTO categories (name, position, parent_id, depth, is_private) VALUES (?, ?, ?, ?, ?)'
    ).bind(name, newPosition, parent_id || null, depth, isPrivate).run();
    
    return new Response(JSON.stringify({
      success: true,
      id: result.meta.last_row_id
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    // 检测 SQLite UNIQUE 约束错误
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      const parentText = parent_id ? '该父分类下' : '根目录下';
      return new Response(JSON.stringify({ 
        error: `分类"${name}"已存在于${parentText}，请使用其他名称` 
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ error: 'Failed to create category' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

