import { ref, computed, watch } from 'vue'

const token = ref(localStorage.getItem('authToken') || '')
const username = ref(localStorage.getItem('authUsername') || '')
const isAuthenticated = computed(() => !!token.value)
const authCallbacks = []

export function useAuth() {
  const login = async (loginUsername, password, rememberMe = false) => {
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: loginUsername, password, rememberMe })
      })
      
      const data = await response.json()
      
      if (data.success) {
        token.value = data.token
        username.value = data.username || loginUsername
        localStorage.setItem('authToken', data.token)
        localStorage.setItem('authUsername', username.value)
        return { success: true }
      } else {
        return { success: false, error: data.error || '登录失败' }
      }
    } catch (error) {
      return { success: false, error: '网络错误' }
    }
  }
  
  const logout = () => {
    token.value = ''
    username.value = ''
    localStorage.removeItem('authToken')
    localStorage.removeItem('authUsername')
  }
  
  const getAuthHeaders = () => {
    if (!token.value) return {}
    return {
      'Authorization': `Bearer ${token.value}`
    }
  }
  
  const onAuthChange = (callback) => {
    authCallbacks.push(callback)
  }
  
  // 全局 API 请求处理函数
  // 401 时自动尝试 token 续期一次并重试，避免长耗时操作中途登录过期
  let refreshingPromise = null

  const refreshToken = async () => {
    if (!token.value) return false
    // 并发请求共享同一个刷新过程，避免重复刷新
    if (!refreshingPromise) {
      refreshingPromise = (async () => {
        try {
          const response = await fetch('/api/refresh', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token.value}` }
          })
          if (!response.ok) return false
          const data = await response.json()
          if (data.success && data.token) {
            token.value = data.token
            localStorage.setItem('authToken', data.token)
            return true
          }
          return false
        } catch {
          return false
        } finally {
          setTimeout(() => { refreshingPromise = null }, 200)
        }
      })()
    }
    return refreshingPromise
  }

  const apiRequest = async (url, options = {}) => {
    const buildOptions = () => ({
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...options.headers
      }
    })

    try {
      let response = await fetch(url, buildOptions())

      // Token 过期：先尝试续期，成功则重试一次原请求
      if (response.status === 401) {
        const refreshed = await refreshToken()
        if (refreshed) {
          response = await fetch(url, buildOptions())
        }
        if (response.status === 401) {
          logout()
          throw new Error('Token expired')
        }
      }

      return response
    } catch (error) {
      if (error.message === 'Token expired') {
        throw error
      }
      throw new Error('网络请求失败')
    }
  }
  
  // 监听认证状态变化
  watch(isAuthenticated, (newVal, oldVal) => {
    if (newVal !== oldVal) {
      authCallbacks.forEach(cb => cb(newVal))
    }
  })
  
  return {
    token,
    username,
    isAuthenticated,
    login,
    logout,
    refreshToken,
    getAuthHeaders,
    onAuthChange,
    apiRequest
  }
}

