import { ref } from 'vue'
import { useAuth } from './useAuth'
import { useToast } from './useToast'

export function useBackup() {
  const { apiRequest } = useAuth()
  const { success: toastSuccess, error: toastError } = useToast()
  
  const creating = ref(false)
  const backups = ref([])
  const loading = ref(false)
  const restoring = ref(false)
  
  // 创建备份
  const createBackup = async (name = null) => {
    creating.value = true
    try {
      const body = name ? { name: name.trim() } : {}
      
      const response = await apiRequest('/api/backup/create', {
        method: 'POST',
        body: JSON.stringify(body)
      })
      
      const result = await response.json()
      
      if (result.success) {
        const displayName = name || '默认备份'
        toastSuccess(`备份"${displayName}"创建成功`)
        // 刷新备份列表
        await listBackups()
        return { success: true, backupKey: result.backupKey }
      } else {
        // 检查是否是 R2 未配置错误
        if (result.code === 'R2_NOT_CONFIGURED' || result.error?.includes('not configured')) {
          toastError('备份功能需要配置 R2 存储。请查看设置页面获取配置说明。')
          return { success: false, error: result.error, code: 'R2_NOT_CONFIGURED' }
        }
        toastError(result.error || '备份创建失败')
        return { success: false, error: result.error }
      }
    } catch (error) {
      if (error.message === 'Token expired') {
        toastError('登录已过期，请重新登录')
      } else {
        toastError('备份创建失败：' + error.message)
      }
      return { success: false, error: error.message }
    } finally {
      creating.value = false
    }
  }
  
  // 列出所有备份
  const listBackups = async () => {
    loading.value = true
    try {
      const response = await apiRequest('/api/backup/list', {
        method: 'GET'
      })
      
      const result = await response.json()
      
      if (result.success) {
        backups.value = result.backups || []
        return { success: true, backups: result.backups, r2Configured: true }
      } else {
        // 检查是否是 R2 未配置错误
        if (result.code === 'R2_NOT_CONFIGURED' || result.error?.includes('not configured')) {
          // R2 未配置，不显示错误提示，让 UI 显示友好提示
          backups.value = []
          return { success: false, error: result.error, code: 'R2_NOT_CONFIGURED', r2Configured: false }
        }
        toastError(result.error || '获取备份列表失败')
        return { success: false, error: result.error, r2Configured: true }
      }
    } catch (error) {
      if (error.message === 'Token expired') {
        toastError('登录已过期，请重新登录')
      } else {
        console.error('Failed to list backups:', error)
        // 不显示错误提示，因为可能是 R2 未配置
      }
      return { success: false, error: error.message, r2Configured: true }
    } finally {
      loading.value = false
    }
  }
  
  // 下载备份
  const downloadBackup = async (backupKey) => {
    try {
      const response = await apiRequest(`/api/backup/download?key=${encodeURIComponent(backupKey)}`, {
        method: 'GET'
      })
      
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || '下载备份失败')
      }
      
      // 获取备份数据
      const backupData = await response.text()
      
      // 创建下载链接
      const blob = new Blob([backupData], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = backupKey
      a.click()
      URL.revokeObjectURL(url)
      
      toastSuccess('备份下载成功')
      return { success: true }
    } catch (error) {
      if (error.message === 'Token expired') {
        toastError('登录已过期，请重新登录')
      } else {
        toastError('下载备份失败：' + error.message)
      }
      return { success: false, error: error.message }
    }
  }
  
  // 恢复备份
  const restoreBackup = async (backupKey) => {
    restoring.value = true
    try {
      // 先获取备份数据
      const downloadResponse = await apiRequest(`/api/backup/download?key=${encodeURIComponent(backupKey)}`, {
        method: 'GET'
      })
      
      if (!downloadResponse.ok) {
        const result = await downloadResponse.json()
        throw new Error(result.error || '获取备份数据失败')
      }
      
      const backupText = await downloadResponse.text()
      const backupData = JSON.parse(backupText)
      
      // 验证备份数据格式
      if (!backupData.data || !backupData.data.categories || !backupData.data.bookmarks) {
        throw new Error('无效的备份数据格式')
      }
      
      // 调用导入 API 恢复数据
      const importResponse = await apiRequest('/api/import', {
        method: 'POST',
        body: JSON.stringify({
          categories: backupData.data.categories,
          bookmarks: backupData.data.bookmarks
        })
      })
      
      const importResult = await importResponse.json()
      
      if (importResult.success) {
        toastSuccess(`备份恢复成功！新增：${importResult.imported.categories} 个分类，${importResult.imported.bookmarks} 个书签`)
        return { 
          success: true, 
          imported: importResult.imported,
          skipped: importResult.skipped
        }
      } else {
        throw new Error(importResult.error || '恢复备份失败')
      }
    } catch (error) {
      if (error.message === 'Token expired') {
        toastError('登录已过期，请重新登录')
      } else {
        toastError('恢复备份失败：' + error.message)
      }
      return { success: false, error: error.message }
    } finally {
      restoring.value = false
    }
  }
  
  // 删除备份
  const deleteBackup = async (backupKey) => {
    try {
      const response = await apiRequest(`/api/backup/delete?key=${encodeURIComponent(backupKey)}`, {
        method: 'DELETE'
      })
      
      const result = await response.json()
      
      if (result.success) {
        toastSuccess('备份删除成功')
        // 刷新备份列表
        await listBackups()
        return { success: true }
      } else {
        toastError(result.error || '删除备份失败')
        return { success: false, error: result.error }
      }
    } catch (error) {
      if (error.message === 'Token expired') {
        toastError('登录已过期，请重新登录')
      } else {
        toastError('删除备份失败：' + error.message)
      }
      return { success: false, error: error.message }
    }
  }
  
  // 格式化文件大小
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }
  
  // 格式化日期
  const formatDate = (dateString) => {
    if (!dateString) return '未知时间'
    const date = new Date(dateString)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }
  
  return {
    creating,
    backups,
    loading,
    restoring,
    createBackup,
    listBackups,
    downloadBackup,
    restoreBackup,
    deleteBackup,
    formatFileSize,
    formatDate
  }
}

