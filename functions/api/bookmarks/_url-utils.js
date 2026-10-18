// URL 清洗与识别工具
// 用于发现形如 `https:/`、`http//`、缺少协议等畸形地址

// 判定 URL 是否合法（http/https + 主机名）
export function isValidHttpUrl(value) {
  if (!value || typeof value !== 'string') return false
  try {
    const u = new URL(value.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    // 必须有主机名且包含点（排除 http://abc 这类）
    return Boolean(u.hostname) && u.hostname.includes('.')
  } catch {
    return false
  }
}

// 尝试修复常见畸形 URL，返回 { url, reason } 或 null
export function repairUrl(raw) {
  if (!raw || typeof raw !== 'string') return null
  let value = raw.trim()

  // 去掉首尾引号
  value = value.replace(/^["'<]+|["'>]+$/g, '')

  // 补全缺失的协议
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) && /^[\w.-]+\.[a-z]{2,}/i.test(value)) {
    return { url: `https://${value.replace(/^\/+/, '')}`, reason: '补全 https 协议' }
  }

  // 修复 "https:/" / "https:/// " 这类斜杠缺失或多余
  const m = value.match(/^(https?):\/{0,3}(.*)$/i)
  if (m) {
    const [, scheme, rest] = m
    if (!rest) return null
    const fixed = `${scheme.toLowerCase()}://${rest.replace(/^\/+/, '')}`
    if (isValidHttpUrl(fixed)) {
      return { url: fixed, reason: '修正协议斜杠' }
    }
  }

  // 协议写成了 http// 或 https,//
  const m2 = value.match(/^(https?)[,;:]?\/{1,2}(.*)$/i)
  if (m2) {
    const fixed = `${m2[1].toLowerCase()}://${m2[2].replace(/^\/+/, '')}`
    if (isValidHttpUrl(fixed)) {
      return { url: fixed, reason: '修正协议分隔符' }
    }
  }

  return null
}

// 检测一组书签里的畸形 URL
export function scanMalformed(rows) {
  return rows
    .filter(row => !isValidHttpUrl(row.url))
    .map(row => {
      const fixed = repairUrl(row.url)
      return {
        id: row.id,
        name: row.name,
        url: row.url,
        suggesed: fixed ? fixed.url : null,
        reason: fixed ? fixed.reason : '无法自动修复'
      }
    })
}
