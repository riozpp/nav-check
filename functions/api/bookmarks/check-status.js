// GET /api/bookmarks/check-status
// 返回定时检测的运行状态与配置情况（需要登录）
// 同时把环境变量是否配置了 CRON_SECRET 告知前端，便于在设置页展示启用状态
export async function onRequestGet(context) {
  const { env } = context;

  try {
    const { results } = await env.DB.prepare(
      "SELECT value FROM settings WHERE key = 'linkCheckLastRun'"
    ).all();

    let lastRun = null;
    if (results && results[0]?.value) {
      try {
        lastRun = JSON.parse(results[0].value);
      } catch {
        lastRun = null;
      }
    }

    const { results: stats } = await env.DB.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN check_status = 'ok' THEN 1 ELSE 0 END) AS ok,
         SUM(CASE WHEN check_status = 'fail' THEN 1 ELSE 0 END) AS fail,
         SUM(CASE WHEN check_status IS NULL OR check_status = '' THEN 1 ELSE 0 END) AS unchecked
       FROM bookmarks`
    ).all();

    return new Response(JSON.stringify({
      success: true,
      // 定时任务是否可用：需要配置 CRON_SECRET
      scheduledEnabled: Boolean(env.CRON_SECRET),
      lastRun,
      stats: stats?.[0] || { total: 0, ok: 0, fail: 0, unchecked: 0 }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('check-status error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
