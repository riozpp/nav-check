// GET list backups - 列出所有备份
export async function onRequestGet(context) {
  const { env } = context;
  
  try {
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
    
    // 列出 R2 中的所有备份文件
    const listResult = await env.BACKUP_BUCKET.list({
      prefix: 'backup-',
    });
    
    // 获取每个备份的详细信息
    const backups = [];
    if (listResult.objects && listResult.objects.length > 0) {
      for (const object of listResult.objects) {
        try {
          // 获取对象的元数据
          const headResult = await env.BACKUP_BUCKET.head(object.key);
          
          // 处理上传时间
          let uploadedTime = null;
          if (object.uploaded) {
            // uploaded 可能是 Date 对象或时间戳
            if (object.uploaded instanceof Date) {
              uploadedTime = object.uploaded.toISOString();
            } else if (typeof object.uploaded === 'number') {
              uploadedTime = new Date(object.uploaded).toISOString();
            } else {
              uploadedTime = new Date(object.uploaded).toISOString();
            }
          }
          
          backups.push({
            key: object.key,
            size: object.size || 0,
            uploaded: uploadedTime,
            customMetadata: headResult?.customMetadata || {},
            httpMetadata: headResult?.httpMetadata || {},
          });
        } catch (error) {
          // 如果获取某个备份的元数据失败，跳过它
          console.error(`Failed to get metadata for ${object.key}:`, error);
          // 仍然添加基本信息
          backups.push({
            key: object.key,
            size: object.size || 0,
            uploaded: object.uploaded ? new Date(object.uploaded).toISOString() : null,
            customMetadata: {},
            httpMetadata: {},
          });
        }
      }
    }
    
    // 按时间倒序排序（最新的在前）
    backups.sort((a, b) => {
      const timeA = new Date(a.uploaded || 0).getTime();
      const timeB = new Date(b.uploaded || 0).getTime();
      return timeB - timeA;
    });
    
    return new Response(JSON.stringify({
      success: true,
      backups: backups,
      count: backups.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Backup list error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Failed to list backups: ' + error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

