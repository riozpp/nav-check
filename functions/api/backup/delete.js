// DELETE backup - 删除备份文件
export async function onRequestDelete(context) {
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
    
    // 删除备份文件
    await env.BACKUP_BUCKET.delete(backupKey);
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Backup deleted successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Backup delete error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Failed to delete backup: ' + error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

