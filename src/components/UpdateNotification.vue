<template>
  <Transition name="slide-down">
    <div v-if="show" class="update-notification">
      <div class="notification-content">
        <div class="notification-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </div>
        <div class="notification-text">
          <div class="notification-title">发现新版本 v{{ latestVersion }}</div>
          <div class="notification-description">
            <div v-if="updateInfo && updateInfo.body" class="update-preview">
              {{ getUpdatePreview(updateInfo.body) }}
            </div>
            <div v-else>点击查看更新详情</div>
          </div>
        </div>
        <div class="notification-actions">
          <button class="btn btn-sm btn-primary" @click="openUpdateDialog">
            查看
          </button>
          <button class="btn btn-sm btn-secondary" @click="dismiss">
            稍后
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useVersion } from '../composables/useVersion'

const { hasUpdate, latestVersion, updateInfo } = useVersion()
const show = ref(false)

onMounted(() => {
  // 检查是否已经显示过这个版本的更新通知
  const dismissedVersion = localStorage.getItem('dismissedUpdateVersion')
  if (hasUpdate.value && dismissedVersion !== latestVersion.value) {
    show.value = true
  }
})

// 监听更新状态变化
watch([hasUpdate, latestVersion], ([newHasUpdate, newLatestVersion]) => {
  if (newHasUpdate) {
    const dismissedVersion = localStorage.getItem('dismissedUpdateVersion')
    if (dismissedVersion !== newLatestVersion) {
      show.value = true
    }
  }
})

const openUpdateDialog = () => {
  if (updateInfo.value) {
    window.open(updateInfo.value.html_url, '_blank')
  }
  show.value = false
}

const dismiss = () => {
  show.value = false
  localStorage.setItem('dismissedUpdateVersion', latestVersion.value)
}

// 获取更新内容预览
const getUpdatePreview = (content) => {
  if (!content) return '点击查看更新详情'
  
  // 提取第一行或前100个字符作为预览
  const lines = content.split('\n').filter(line => line.trim())
  const firstLine = lines[0] || ''
  
  // 移除 Markdown 标记
  const cleanText = firstLine
    .replace(/^#+\s*/, '') // 移除标题标记
    .replace(/\*\*(.*?)\*\*/g, '$1') // 移除加粗标记
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 移除链接标记
    .trim()
  
  return cleanText.length > 100 ? cleanText.substring(0, 100) + '...' : cleanText
}
</script>

<style scoped>
.update-notification {
  position: fixed;
  top: 20px;
  right: 20px;
  background: var(--bg);
  border: 1px solid var(--warning);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 25px var(--shadow-lg);
  z-index: 5000;
  max-width: 400px;
}

.notification-content {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
}

.notification-icon {
  width: 40px;
  height: 40px;
  background: var(--warning);
  color: white;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.notification-text {
  flex: 1;
}

.notification-title {
  font-weight: var(--font-semibold);
  color: var(--text);
  margin-bottom: var(--space-1);
}

.notification-description {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.update-preview {
  font-style: italic;
  line-height: 1.4;
  max-height: 3em;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.notification-actions {
  display: flex;
  gap: var(--space-2);
}

.btn-sm {
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-xs);
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>
