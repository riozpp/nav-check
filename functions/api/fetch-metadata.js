// GET fetch website metadata
export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');
  
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'URL parameter is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // 验证URL格式
    new URL(targetUrl);
    
    // 获取网页内容
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch page');
    }
    
    const html = await response.text();
    
    // 解析 HTML 提取标题和描述
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    
    const title = ogTitleMatch?.[1] || titleMatch?.[1] || '';
    const description = ogDescMatch?.[1] || descMatch?.[1] || '';
    
    // 清理标题和描述
    const cleanTitle = title.trim().replace(/\s+/g, ' ').substring(0, 100);
    const cleanDesc = description.trim().replace(/\s+/g, ' ').substring(0, 200);
    
    return new Response(JSON.stringify({
      success: true,
      title: cleanTitle,
      description: cleanDesc
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: '无法获取网页信息，请手动输入'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

