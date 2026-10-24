<template>
  <div class="settings-section">
    <h2 class="section-title">数据管理</h2>
    
    <!-- 导入导出 -->
    <div class="form-group">
      <div class="form-header">
        <div class="form-title">导入/导出</div>
        <div class="form-description">备份或恢复书签数据</div>
      </div>
      <button class="text-btn" @click="$emit('action', 'importExport')">
        导入/导出
      </button>
    </div>
    
    <!-- 云端备份 -->
    <div class="form-group">
      <div class="form-header">
        <div class="form-title">云端备份</div>
        <div class="form-description">将数据备份到 Cloudflare R2 存储，支持备份列表管理和恢复</div>
      </div>
      <button class="text-btn" @click="$emit('action', 'backup')">
        备份管理
      </button>
    </div>
    
    <!-- 清理空分类 -->
    <div class="form-group">
      <div class="form-header">
        <div class="form-title">清理空分类</div>
        <div class="form-description">
          <span v-if="emptyCategoryCount > 0">
            发现 {{ emptyCategoryCount }} 个空分类
          </span>
          <span v-else>
            当前没有空分类
          </span>
        </div>
      </div>
      <button 
        class="text-btn" 
        @click="$emit('action', 'cleanupEmptyCategories')"
        :disabled="emptyCategoryCount === 0"
      >
        {{ emptyCategoryCount > 0 ? '清理空分类' : '无空分类' }}
      </button>
    </div>
    
    <!-- 链接有效性检测 -->
    <div class="form-group">
      <div class="form-header">
        <div class="form-title">书签有效性检测</div>
        <div class="form-description">
          <span v-if="failCount > 0">
            上次检测发现 {{ failCount }} 个失效书签
          </span>
          <span v-else>
            批量检测书签 URL 是否可以正常访问
          </span>
        </div>
      </div>
      <button class="text-btn" @click="$emit('action', 'linkCheck')">
        开始检测
      </button>
    </div>

    <!-- AI 智能分类 -->
    <div class="form-group">
      <div class="form-header">
        <div class="form-title">AI 智能分类</div>
        <div class="form-description">
          AI 分析全部书签，自动创建分类并把每个书签归入最合适的分类
        </div>
      </div>
      <button class="text-btn" @click="$emit('action', 'smartOrganize')">
        开始智能分类
      </button>
    </div>

    <!-- 清除所有分类 -->
    <div class="form-group">
      <div class="form-header">
        <div class="form-title">清除所有分类</div>
        <div class="form-description">
          删除全部分类结构，所有书签保留并移入「未分类」（不可撤销，建议先备份）
        </div>
      </div>
      <button class="text-btn danger" @click="$emit('action', 'clearAllCategories')">
        清除所有分类
      </button>
    </div>

    <!-- 定时全量检测 -->
    <div class="form-group">
      <div class="form-header">
        <div class="form-title">定时全量检测</div>
        <div class="form-description">
          <span v-if="scheduledEnabled">
            已启用：通过 GitHub Actions 每天自动检测全部书签<br>
            <span v-if="lastRun" class="last-run">
              上次运行：{{ formatTime(lastRun.at) }}（检测 {{ lastRun.total }} 个，失效 {{ lastRun.fail }} 个）
            </span>
            <span v-else class="last-run">尚未运行过</span>
            <span v-if="stats && stats.unchecked > 0" class="last-run">
              · 还有 {{ stats.unchecked }} 个书签未经检测
            </span>
          </span>
          <span v-else>
            未启用：需在 Cloudflare 配置 CRON_SECRET，并在 GitHub 仓库配置 Actions 密钥
          </span>
        </div>
      </div>
      <div class="action-group">
        <button
          v-if="scheduledEnabled"
          class="text-btn"
          @click="runScheduledNow"
          :disabled="running"
        >
          {{ running ? '执行中…' : '立即运行' }}
        </button>
        <button class="text-btn" @click="$emit('action', 'linkCheck')">
          手动检测
        </button>
      </div>
    </div>

    <!-- 书签数据体检 -->
    <div class="form-group">
      <div class="form-header">
        <div class="form-title">书签数据体检</div>
        <div class="form-description">
          一键检查缺图标、缺描述、缺标签、失效链接与畸形 URL，并批量修复
        </div>
      </div>
      <button class="text-btn" @click="$emit('action', 'maintenance')">
        开始体检
      </button>
    </div>

    <!-- 批量替换 URL -->
    <div class="form-group">
      <div class="form-header">
        <div class="form-title">批量替换 URL</div>
        <div class="form-description">
          按「查找-替换」批量修改书签地址，适合 NAS IP 或域名变更时批量更新
        </div>
      </div>
      <button class="text-btn" @click="$emit('action', 'replaceUrl')">
        查找替换
      </button>
    </div>

    <!-- 统计信息 -->
    <div class="form-group">
      <div class="form-header">
        <div class="form-title">书签统计</div>
        <div class="form-description">
          共 {{ totalBookmarks }} 个书签，其中 {{ privateBookmarks }} 个私密书签
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuth } from '../../composables/useAuth'
import { useToast } from '../../composables/useToast'

const props = defineProps({
  totalBookmarks: Number,
  privateBookmarks: Number,
  failCount: {
    type: Number,
    default: 0
  },
  emptyCategoryCount: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['action', 'reload'])

const { apiRequest } = useAuth()
const { success: toastSuccess, error: toastError } = useToast()

const scheduledEnabled = ref(false)
const lastRun = ref(null)
const stats = ref(null)
const running = ref(false)

const formatTime = (iso) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('zh-CN')
  } catch {
    return iso
  }
}

// 拉取定时检测状态，每次进入设置页时刷新
const loadStatus = async () => {
  try {
    const response = await apiRequest('/api/bookmarks/check-status')
    if (!response.ok) return
    const data = await response.json()
    scheduledEnabled.value = Boolean(data.scheduledEnabled)
    lastRun.value = data.lastRun
    stats.value = data.stats
  } catch (error) {
    console.error('加载检测状态失败:', error)
  }
}

// 立即触发一次滚动检测（复用定时任务使用的接口，需登录态 + CRON_SECRET 由后端校验）
const runScheduledNow = async () => {
  running.value = true
  try {
    const response = await apiRequest('/api/bookmarks/check-all-now', {
      method: 'POST',
      body: JSON.stringify({ limit: 50 })
    })
    const data = await response.json()
    if (data.success) {
      toastSuccess(`检测完成：共 ${data.total} 个，失效 ${data.fail} 个`)
      await loadStatus()
      emit('reload')
    } else {
      toastError(data.error || '检测失败')
    }
  } catch (error) {
    toastError(error.message || '检测失败')
  } finally {
    running.value = false
  }
}

onMounted(loadStatus)

defineExpose({ loadStatus })
</script>

<style scoped>
.settings-section {
  max-width: 800px;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 1.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: transparent;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.form-header {
  flex: 1;
}

.form-title {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 0.5rem;
}

.form-description {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.text-btn {
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 0.9375rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: color 0.2s ease;
  font-weight: 500;
  white-space: nowrap;
}

.text-btn:hover:not(:disabled) {
  color: var(--primary);
}

.text-btn:disabled {
  color: var(--text-secondary);
  cursor: not-allowed;
  opacity: 0.6;
}

.text-btn.danger {
  color: #dc2626;
}

.text-btn.danger:hover:not(:disabled) {
  color: #b91c1c;
}

.action-group {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.last-run {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.78rem;
  color: var(--text-secondary);
}
</style>
