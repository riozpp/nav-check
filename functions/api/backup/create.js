// POST create backup - 创建备份并上传到 R2
export async function onRequestPost(context) {
  const { env, request } = context;
  
  try {
    // 验证 R2 bucket 是否配置
    if (!env.BACKUP_BUCKET) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'R2 bucket not configured',
        code: 'R2_NOT_CONFIGURED',
        message: '备份功能需要配置 R2 存储。请在 Cloudflare Dashboard 中创建 R2 bucket 并绑定到 Pages 项目。'
      }), {
        status: 503, // 使用 503 表示服务不可用，而不是 500 内部错误
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 获取请求体（支持自定义名称）
    const body = await request.json().catch(() => ({}));
    let backupName = body.name?.trim();
    
    // 验证备份名称（如果提供）
    if (backupName) {
      // 检查长度（1-50个字符）
      if (backupName.length === 0 || backupName.length > 50) {
        return new Response(JSON.stringify({ 
          success: false,
          error: '备份名称长度必须在 1-50 个字符之间' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // 获取所有数据
    // 1. 获取分类
    const categoriesResult = await env.DB.prepare(
      'SELECT * FROM categories ORDER BY depth, position'
    ).all();
    
    // 2. 获取书签（包括私密书签，因为这是备份）
    const bookmarksResult = await env.DB.prepare(
      'SELECT * FROM bookmarks ORDER BY category_id, position'
    ).all();
    
    // 3. 获取设置（包括所有设置，但排除敏感信息）
    const settingsResult = await env.DB.prepare(
      'SELECT key, value FROM settings ORDER BY key'
    ).all();
    
    // 过滤敏感设置（不备份 AI API Key 等敏感信息）
    const settings = {};
    settingsResult.results.forEach(row => {
      // 不备份以 secret_ 开头的设置
      if (!row.key?.startsWith('secret_')) {
        settings[row.key] = row.value;
      }
    });
    
    // 构建备份数据
    const backupData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      type: 'full',
      name: backupName || null, // 保存备份名称（如果有）
      data: {
        categories: categoriesResult.results || [],
        bookmarks: bookmarksResult.results || [],
        settings: settings
      },
      metadata: {
        categoryCount: categoriesResult.results?.length || 0,
        bookmarkCount: bookmarksResult.results?.length || 0,
        settingCount: Object.keys(settings).length
      }
    };
    
    // 生成备份文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    let backupKey;
    
    if (backupName) {
      // 如果有自定义名称，将名称中的特殊字符替换为连字符，确保文件名安全
      // 只保留字母、数字、连字符、下划线，其他字符替换为连字符
      const sanitizedName = backupName
        .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '-') // 保留中文、字母、数字、连字符、下划线
        .replace(/-+/g, '-') // 将多个连字符替换为单个
        .replace(/^-|-$/g, ''); // 移除开头和结尾的连字符
      
      // 组合时间戳和名称
      backupKey = `backup-${timestamp}-${sanitizedName}.json`;
    } else {
      // 使用默认时间戳格式
      backupKey = `backup-${timestamp}.json`;
    }
    
    // 将备份数据转换为 JSON 字符串
    const backupJson = JSON.stringify(backupData, null, 2);
    
    // 上传到 R2
    await env.BACKUP_BUCKET.put(backupKey, backupJson, {
      httpMetadata: {
        contentType: 'application/json',
      },
      customMetadata: {
        timestamp: backupData.timestamp,
        type: backupData.type,
        name: backupName || '', // 保存自定义名称（用于显示）
        categoryCount: backupData.metadata.categoryCount.toString(),
        bookmarkCount: backupData.metadata.bookmarkCount.toString(),
      },
    });
    
    return new Response(JSON.stringify({
      success: true,
      backupKey: backupKey,
      timestamp: backupData.timestamp,
      name: backupName || null,
      metadata: backupData.metadata
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Backup creation error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Failed to create backup: ' + error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

