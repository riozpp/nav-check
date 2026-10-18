// 防抖函数
export function debounce(fn, delay = 300) {
  let timeoutId
  return function (...args) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}

// 节流函数
export function throttle(fn, limit = 300) {
  let inThrottle
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

