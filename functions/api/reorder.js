// POST batch update positions
export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { type, items } = await request.json();
    
    // items格式: [{ id: 1, position: 0 }, { id: 2, position: 1 }, ...]
    
    if (type === 'bookmarks') {
      // 批量更新书签位置
      const statements = items.map(item => 
        env.DB.prepare('UPDATE bookmarks SET position = ? WHERE id = ?')
          .bind(item.position, item.id)
      );
      
      await env.DB.batch(statements);
    } else if (type === 'categories') {
      // 批量更新分类位置
      const statements = items.map(item => 
        env.DB.prepare('UPDATE categories SET position = ? WHERE id = ?')
          .bind(item.position, item.id)
      );
      
      await env.DB.batch(statements);
    } else {
      return new Response(JSON.stringify({ error: 'Invalid type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to reorder items' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

