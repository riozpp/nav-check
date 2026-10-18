// PUT update category (support nested structure)
export async function onRequestPut(context) {
  const { request, env, params } = context;
  const id = Number(params.id);
  let name, newParentId;
  
  try {
    const body = await request.json();
    name = body.name;
    const { parent_id, position, is_private } = body;
    
    const existing = await env.DB.prepare(
      'SELECT id, parent_id, depth, position, is_private FROM categories WHERE id = ?'
    ).bind(id).first();
    
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Category not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 处理 parent_id 更新
    newParentId = existing.parent_id;
    let newDepth = existing.depth;
    const parentProvided = Object.prototype.hasOwnProperty.call(body, 'parent_id');
    if (parentProvided) {
      if (parent_id === id) {
        return new Response(JSON.stringify({ error: 'Category cannot be its own parent' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (parent_id === null || parent_id === undefined) {
        newParentId = null;
        newDepth = 0;
      } else {
        const parent = await env.DB.prepare(
          'SELECT id, parent_id, depth FROM categories WHERE id = ?'
        ).bind(parent_id).first();
        
        if (!parent) {
          return new Response(JSON.stringify({ error: 'Parent category not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // 检查循环引用
        let currentParentId = parent.parent_id;
        while (currentParentId !== null && currentParentId !== undefined) {
          if (currentParentId === id) {
            return new Response(JSON.stringify({ error: 'Cannot set descendant as parent' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          const ancestor = await env.DB.prepare(
            'SELECT parent_id FROM categories WHERE id = ?'
          ).bind(currentParentId).first();
          currentParentId = ancestor?.parent_id ?? null;
        }
        
        newParentId = parent_id;
        newDepth = parent.depth + 1;
        
        if (newDepth > 5) {
          return new Response(JSON.stringify({ error: 'Maximum nesting depth (5) exceeded' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }
    
    // 处理 position
    let newPosition = existing.position;
    const positionProvided = Object.prototype.hasOwnProperty.call(body, 'position');
    if (positionProvided && typeof position === 'number') {
      newPosition = position;
    } else if (parentProvided && newParentId !== existing.parent_id) {
      const whereClause = newParentId ? 'WHERE parent_id = ?' : 'WHERE parent_id IS NULL';
      const query = `SELECT COALESCE(MAX(position), -1) as position FROM categories ${whereClause}`;
      const { position: maxPosition } = newParentId
        ? await env.DB.prepare(query).bind(newParentId).first()
        : await env.DB.prepare(query).first();
      newPosition = (maxPosition || -1) + 1;
    }
    
    // 处理 is_private
    let newIsPrivate = existing.is_private;
    if (Object.prototype.hasOwnProperty.call(body, 'is_private')) {
      newIsPrivate = is_private ? 1 : 0;
    }
    
    // 检查同一父分类下是否已存在同名分类（排除自己）
    const checkWhereClause = newParentId ? 'WHERE name = ? AND parent_id = ? AND id != ?' : 'WHERE name = ? AND parent_id IS NULL AND id != ?';
    const checkQuery = `SELECT id FROM categories ${checkWhereClause}`;
    const existingCategory = newParentId
      ? await env.DB.prepare(checkQuery).bind(name, newParentId, id).first()
      : await env.DB.prepare(checkQuery).bind(name, id).first();
    
    if (existingCategory) {
      const parentText = newParentId ? '该父分类下' : '根目录下';
      return new Response(JSON.stringify({ 
        error: `分类"${name}"已存在于${parentText}，请使用其他名称` 
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    await env.DB.prepare(
      'UPDATE categories SET name = ?, parent_id = ?, depth = ?, position = ?, is_private = ? WHERE id = ?'
    ).bind(name, newParentId || null, newDepth, newPosition, newIsPrivate, id).run();
    
    // 如果 depth 发生变化，需要递归更新所有子分类的 depth
    if (newDepth !== existing.depth) {
      const depthDiff = newDepth - existing.depth;
      await updateDescendantsDepth(env.DB, id, depthDiff);
    }
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    // 检测 SQLite UNIQUE 约束错误
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      const parentText = newParentId ? '该父分类下' : '根目录下';
      return new Response(JSON.stringify({ 
        error: `分类"${name}"已存在于${parentText}，请使用其他名称` 
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ error: 'Failed to update category' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 递归更新所有子分类的 depth
async function updateDescendantsDepth(db, parentId, depthDiff) {
  // 获取所有直接子分类
  const children = await db.prepare(
    'SELECT id, depth FROM categories WHERE parent_id = ?'
  ).bind(parentId).all();
  
  // 递归更新每个子分类及其子分类
  for (const child of children.results) {
    const newChildDepth = child.depth + depthDiff;
    
    // 检查深度限制
    if (newChildDepth > 5) {
      throw new Error(`Moving category would exceed maximum depth for child category ${child.id}`);
    }
    
    // 更新当前子分类的 depth
    await db.prepare(
      'UPDATE categories SET depth = ? WHERE id = ?'
    ).bind(newChildDepth, child.id).run();
    
    // 递归更新其子分类
    await updateDescendantsDepth(db, child.id, depthDiff);
  }
}

// DELETE category (cascade delete bookmarks)
export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = params.id;
  
  try {
    // D1支持外键级联删除
    await env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to delete category' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

