// GET download backup - 下载备份文件
export async function onRequestGet(context) {
  const { env, request } = context;
  
  try {
    const url = new URL(request.url);
    const backupKey = url.searchParams.get('key');
    
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
    
    // 验证备份文件名格式（防止路径遍历攻击）
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
    const backupData = await object.text();
    
    // 返回备份数据
    return new Response(backupData, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${backupKey}"`,
      }
    });
  } catch (error) {
    console.error('Backup download error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Failed to download backup: ' + error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

