// POST /api/bookmarks/[id]/click
// 记录一次书签点击（公开接口，前端点击卡片时静默调用）
export async function onRequestPost(context) {
  const { env, params } = context
  const id = params.id

  try {
    await env.DB.prepare(
      `UPDATE bookmarks
       SET click_count = COALESCE(click_count, 0) + 1,
           last_clicked_at = ?
       WHERE id = ?`
    ).bind(new Date().toISOString(), id).run()

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('record click error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
