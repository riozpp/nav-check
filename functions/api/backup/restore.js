// POST restore backup - 从备份恢复数据
export async function onRequestPost(context) {
  const { env, request } = context;
  
  try {
    const { backupKey } = await request.json();
    
    if (!backupKey) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Backup key is required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 验证 R2 bucket 是否配置
    if (!env.BACKUP_BUCKET) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'R2 bucket not configured',
        code: 'R2_NOT_CONFIGURED',
        message: '备份功能需要配置 R2 存储。请在 Cloudflare Dashboard 中创建 R2 bucket 并绑定到 Pages 项目。'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 验证备份文件名格式
    if (!backupKey.startsWith('backup-') || !backupKey.endsWith('.json')) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Invalid backup key format' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 从 R2 获取备份文件
    const object = await env.BACKUP_BUCKET.get(backupKey);
    
    if (!object) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Backup not found' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 读取备份数据
    const backupText = await object.text();
    const backupData = JSON.parse(backupText);
    
    // 验证备份数据格式
    if (!backupData.data || !backupData.data.categories || !backupData.data.bookmarks) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Invalid backup data format' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 恢复数据（复用导入逻辑）
    const { categories, bookmarks, settings } = backupData.data;
    
    // 1. 恢复设置
    if (settings && Object.keys(settings).length > 0) {
      const settingsStatements = Object.entries(settings).map(([key, value]) => 
        env.DB.prepare(
          'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
        ).bind(key, value)
      );
      await env.DB.batch(settingsStatements);
    }
    
    // 2. 恢复分类和书签（使用现有的导入逻辑）
    // 注意：这里需要清空现有数据或使用导入 API 的逻辑
    // 为了安全，我们使用导入逻辑（会跳过已存在的项）
    
    // 这里简化处理：直接返回备份数据，让前端调用导入 API
    // 或者可以选择清空后重新导入
    
    // 返回备份数据供前端使用
    return new Response(JSON.stringify({
      success: true,
      backupData: {
        categories: categories,
        bookmarks: bookmarks,
        settings: settings,
        metadata: backupData.metadata
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Backup restore error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Failed to restore backup: ' + error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

