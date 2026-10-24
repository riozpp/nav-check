import { ref } from 'vue'
import { useAuth } from './useAuth'

const aiEnabled = ref(false)
const aiSource = ref('none')
const aiApiKey = ref('')
const aiBaseUrl = ref('')

export function useAI() {
  const { apiRequest } = useAuth()

  const checkAIAvailability = async () => {
    try {
      const response = await apiRequest('/api/ai/status', {
        method: 'GET'
      })
      
      const result = await response.json()
      if (result.success) {
        aiEnabled.value = result.enabled
        aiSource.value = result.source || 'none'
        return { success: true, enabled: result.enabled, source: result.source }
      }
      return { success: false, enabled: false }
    } catch (error) {
      aiEnabled.value = false
      aiSource.value = 'none'
      return { success: false, enabled: false }
    }
  }

  const generateDescription = async (name, url) => {
    try {
      const response = await apiRequest('/api/ai/generate-description', {
        method: 'POST',
        body: JSON.stringify({ name, url })
      })
      
      const result = await response.json()
      if (result.success) {
        return { success: true, description: result.description }
      }
      return { success: false, error: result.error || '生成失败' }
    } catch (error) {
      if (error.message === 'Token expired') {
        return { success: false, error: '登录已过期，请重新登录' }
      }
      return { success: false, error: '网络错误' }
    }
  }

  const suggestCategory = async (name, url, description, categories) => {
    try {
      const response = await apiRequest('/api/ai/suggest-category', {
        method: 'POST',
        body: JSON.stringify({ name, url, description, categories })
      })
      
      const result = await response.json()
      if (result.success) {
        return { success: true, categoryId: result.categoryId, reason: result.reason }
      }
      return { success: false, error: result.error || '推荐失败' }
    } catch (error) {
      if (error.message === 'Token expired') {
        return { success: false, error: '登录已过期，请重新登录' }
      }
      return { success: false, error: '网络错误' }
    }
  }

  const batchGenerateDescriptions = async (bookmarks) => {
    try {
      const response = await apiRequest('/api/ai/batch-generate-descriptions', {
        method: 'POST',
        body: JSON.stringify({ bookmarks })
      })
      
      const result = await response.json()
      if (result.success) {
        return { 
          success: true, 
          results: result.results,
          successCount: result.successCount,
          failedCount: result.failedCount
        }
      }
      return { success: false, error: result.error || '批量生成失败' }
    } catch (error) {
      if (error.message === 'Token expired') {
        return { success: false, error: '登录已过期，请重新登录' }
      }
      return { success: false, error: '网络错误' }
    }
  }

  const batchClassify = async (bookmarks, categories) => {
    try {
      const response = await apiRequest('/api/ai/batch-classify', {
        method: 'POST',
        body: JSON.stringify({ bookmarks, categories })
      })
      
      const result = await response.json()
      if (result.success) {
        return { 
          success: true, 
          results: result.results,
          successCount: result.successCount,
          failedCount: result.failedCount
        }
      }
      return { success: false, error: result.error || '批量分类失败' }
    } catch (error) {
      if (error.message === 'Token expired') {
        return { success: false, error: '登录已过期，请重新登录' }
      }
      return { success: false, error: '网络错误' }
    }
  }

  // 智能分类·分块分析：每次处理一批书签，避免单请求超时
  const smartOrganizeChunk = async (chunkBookmarks, existingCategories, knownCategories) => {
    try {
      const response = await apiRequest('/api/ai/smart-organize/chunk', {
        method: 'POST',
        body: JSON.stringify({ bookmarks: chunkBookmarks, existingCategories, knownCategories })
      })
      let result
      try {
        result = await response.json()
      } catch {
        // 响应不是 JSON（如 524 超时页），带上状态码方便定位
        return { success: false, error: `服务端返回 ${response.status}（可能超时）` }
      }
      if (result.success) {
        return { success: true, categories: result.categories || [], assign: result.assign || {} }
      }
      return { success: false, error: result.error || `失败(${response.status})` }
    } catch (error) {
      if (error.message === 'Token expired') {
        return { success: false, error: '登录已过期，请重新登录' }
      }
      return { success: false, error: error.message || '网络错误' }
    }
  }

  // 智能分类·应用结果：创建分类并写回书签
  const smartOrganizeApply = async (assign) => {
    try {
      const response = await apiRequest('/api/ai/smart-organize/apply', {
        method: 'POST',
        body: JSON.stringify({ assign })
      })
      let result
      try {
        result = await response.json()
      } catch {
        return { success: false, error: `服务端返回 ${response.status}（可能超时）` }
      }
      if (result.success) {
        return { success: true, ...result }
      }
      return { success: false, error: result.error || '写入失败' }
    } catch (error) {
      if (error.message === 'Token expired') {
        return { success: false, error: '登录已过期，请重新登录' }
      }
      return { success: false, error: '网络错误' }
    }
  }

  const saveAISettings = async (settings) => {
    try {
      const response = await apiRequest('/api/ai/settings', {
        method: 'POST',
        body: JSON.stringify(settings)
      })
      
      const result = await response.json()
      if (result.success) {
        await checkAIAvailability()
        return { success: true }
      }
      return { success: false, error: result.error || '保存失败' }
    } catch (error) {
      if (error.message === 'Token expired') {
        return { success: false, error: '登录已过期，请重新登录' }
      }
      return { success: false, error: '网络错误' }
    }
  }

  const getAISettings = async () => {
    try {
      const response = await apiRequest('/api/ai/settings', {
        method: 'GET'
      })
      
      const result = await response.json()
      if (result.success) {
        aiApiKey.value = result.apiKey || ''
        aiBaseUrl.value = result.baseUrl || ''
        if (result.source) {
          aiSource.value = result.source
        }
        return { 
          success: true, 
          apiKey: result.apiKey || '',
          baseUrl: result.baseUrl || 'https://api.openai.com/v1',
          model: result.model || 'gpt-4o-mini',
          authHeader: result.authHeader || 'Authorization',
          authPrefix: result.authPrefix !== undefined ? result.authPrefix : 'Bearer ',
          hasApiKey: !!result.hasApiKey,
          lockedFields: result.lockedFields || {},
          customPromptDescriptionEnabled: result.customPromptDescriptionEnabled || false,
          customPromptDescription: result.customPromptDescription || ''
        }
      }
      return { success: false, error: result.error || '获取失败' }
    } catch (error) {
      if (error.message === 'Token expired') {
        return { success: false, error: '登录已过期，请重新登录' }
      }
      return { success: false, error: '网络错误' }
    }
  }

  const verifyApiKey = async (apiKey, baseUrl, model) => {
    try {
      const response = await apiRequest('/api/ai/verify', {
        method: 'POST',
        body: JSON.stringify({ apiKey, baseUrl, model })
      })
      
      const result = await response.json()
      return { 
        success: result.success, 
        valid: result.valid, 
        message: result.message 
      }
    } catch (error) {
      return { 
        success: false, 
        valid: false, 
        message: error.message || '验证失败' 
      }
    }
  }

  return {
    aiEnabled,
    aiSource,
    aiApiKey,
    aiBaseUrl,
    checkAIAvailability,
    generateDescription,
    suggestCategory,
    batchGenerateDescriptions,
    batchClassify,
    smartOrganizeChunk,
    smartOrganizeApply,
    saveAISettings,
    getAISettings,
    verifyApiKey
  }
}
