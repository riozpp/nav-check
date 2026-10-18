<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="dialog-overlay" @click="close">
        <div class="dialog-box link-check-dialog" @click.stop>
          <h3 class="dialog-title">书签有效性检测</h3>
          
          <!-- 检测前：选项 -->
          <div v-if="!checking && !finished" class="check-options">
            <div class="form-group">
              <label>检测范围</label>
              <div class="radio-group">
                <label class="radio-label">
                  <input v-model="scope" type="radio" value="all" name="checkScope">
                  <span>全部书签（{{ bookmarkList.length }} 个）</span>
                </label>
                <label class="radio-label">
                  <input v-model="scope" type="radio" value="unchecked" name="checkScope">
                  <span>仅未检测过的（{{ uncheckedCount }} 个）</span>
                </label>
              </div>
            </div>
            <p class="check-hint">
              检测会对每个书签的 URL 发起 HEAD 请求（失败时回退 GET）。为避免误杀开启
              反爬的站点，仅 <strong>404 / 410 与无法连接</strong> 判定为失效，403、429、5xx
              等一律视为可达。每次最多检测 30 个，多出的会自动分批进行。
            </p>
            <div class="dialog-buttons">
              <button class="btn btn-secondary" @click="close">取消</button>
              <button
                class="btn btn-primary"
                :disabled="targetIds.length === 0"
                @click="startCheck"
              >
                {{ targetIds.length === 0 ? '无可检测书签' : '开始检测' }}
              </button>
            </div>
          </div>

          <!-- 检测中：进度 -->
          <div v-else-if="checking" class="check-progress">
            <div class="progress-info">
              正在检测… {{ checkedCount }} / {{ totalCount }}
            </div>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
            </div>
            <div class="dialog-buttons">
              <button class="btn btn-secondary" @click="close">后台关闭（检测已暂停）</button>
            </div>
          </div>

          <!-- 检测完成：结果 -->
          <div v-else class="check-results">
            <div class="result-summary">
              <span class="summary-ok">✅ 正常：{{ okCount }}</span>
              <span class="summary-fail">❌ 失效：{{ failCount }}</span>
            </div>

            <div class="result-filter">
              <label class="radio-label">
                <input v-model="resultFilter" type="radio" value="all" name="resultFilter">
                <span>全部</span>
              </label>
              <label class="radio-label">
                <input v-model="resultFilter" type="radio" value="fail" name="resultFilter">
                <span>仅失效</span>
              </label>
            </div>

            <div class="result-list">
              <div
                v-for="item in filteredResults"
                :key="item.id"
                class="result-item"
                :class="item.ok ? 'ok' : 'fail'"
              >
                <span class="result-status">
                  {{ item.ok ? '✅' : '❌' }}
                  <small>{{ item.status ? 'HTTP ' + item.status : (item.error || '失败') }}</small>
                </span>
                <div class="result-info">
                  <div class="result-name">{{ getBookmarkName(item.id) }}</div>
                  <div class="result-url">{{ item.url }}</div>
                </div>
                <div class="result-actions">
                  <button
                    v-if="!item.ok"
                    class="btn btn-ghost btn-sm"
                    @click="repairLink(item)"
                    :disabled="repairingId === item.id"
                    title="让 AI 推断替代链接"
                  >
                    {{ repairingId === item.id ? '分析中…' : 'AI 修复' }}
                  </button>
                  <button
                    class="btn btn-ghost btn-sm"
                    @click="openWayback(item)"
                    title="在 Wayback Machine 中查找存档"
                  >存档</button>
                  <button
                    v-if="!item.ok"
                    class="btn btn-danger btn-sm"
                    @click="$emit('deleteBookmark', item.id)"
                    title="删除该书签"
                  >删除</button>
                </div>
              </div>

              <div v-if="repairResults[item.id]" class="repair-box">
                <div class="repair-row">
                  <strong>替代链接：</strong>
                  <a v-if="repairResults[item.id].alternative" :href="repairResults[item.id].alternative" target="_blank" rel="noopener noreferrer">
                    {{ repairResults[item.id].alternative }}
                  </a>
                  <span v-else class="repair-none">未找到可行替代</span>
                </div>
                <div class="repair-row">
                  <strong>存档地址：</strong>
                  <a :href="repairResults[item.id].wayback" target="_blank" rel="noopener noreferrer">
                    {{ repairResults[item.id].wayback }}
                  </a>
                </div>
                <div v-if="repairResults[item.id].reason" class="repair-row repair-reason">
                  {{ repairResults[item.id].reason }}
                </div>
                <div v-if="repairResults[item.id].error" class="repair-row repair-error">
                  {{ repairResults[item.id].error }}
                </div>
              </div>
            </div>

            <div class="dialog-buttons">
              <button class="btn btn-secondary" @click="close">关闭</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuth } from '../composables/useAuth'

const props = defineProps({
  bookmarkList: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['checked', 'deleteBookmark'])

const { apiRequest } = useAuth()

const show = ref(false)
const checking = ref(false)
const finished = ref(false)
const scope = ref('all')
const results = ref([])
const totalCount = ref(0)
const checkedCount = ref(0)
const resultFilter = ref('all')
const repairResults = ref({})
const repairingId = ref(null)

const CHUNK_SIZE = 20 // 前端分批，每批调一次 API

const uncheckedCount = computed(() =>
  props.bookmarkList.filter(b => !b.check_status).length
)

const targetIds = computed(() => {
  if (scope.value === 'unchecked') {
    return props.bookmarkList.filter(b => !b.check_status).map(b => b.id)
  }
  return props.bookmarkList.map(b => b.id)
})

const progressPercent = computed(() =>
  totalCount.value === 0 ? 0 : Math.round((checkedCount.value / totalCount.value) * 100)
)

const okCount = computed(() => results.value.filter(r => r.ok).length)
const failCount = computed(() => results.value.filter(r => !r.ok).length)

const filteredResults = computed(() =>
  resultFilter.value === 'fail' ? results.value.filter(r => !r.ok) : results.value
)

const getBookmarkName = (id) =>
  props.bookmarkList.find(b => b.id === id)?.name || ''

const open = () => {
  show.value = true
  checking.value = false
  finished.value = false
  results.value = []
  repairResults.value = {}
  repairingId.value = null
  checkedCount.value = 0
  resultFilter.value = 'all'
  // 默认选择更有意义的一档
  scope.value = uncheckedCount.value > 0 ? 'unchecked' : 'all'
}

// 让 AI 为失效书签推断替代链接
const repairLink = async (item) => {
  const bookmark = props.bookmarkList.find(b => b.id === item.id)
  if (!bookmark) return
  repairingId.value = item.id
  try {
    const response = await apiRequest('/api/ai/repair-link', {
      method: 'POST',
      body: JSON.stringify({
        title: bookmark.name,
        url: bookmark.url,
        description: bookmark.description || ''
      })
    })
    const data = await response.json()
    repairResults.value = {
      ...repairResults.value,
      [item.id]: data.success
        ? { alternative: data.alternative, wayback: data.wayback, reason: data.reason }
        : { error: data.error || 'AI 修复失败' }
    }
  } catch (error) {
    repairResults.value = {
      ...repairResults.value,
      [item.id]: { error: error.message || 'AI 修复失败' }
    }
  } finally {
    repairingId.value = null
  }
}

// 在新窗口打开 Wayback Machine 存档查询
const openWayback = (item) => {
  window.open(`https://web.archive.org/web/2024/${item.url}`, '_blank', 'noopener,noreferrer')
}

const close = () => {
  show.value = false
}

const startCheck = async () => {
  const ids = targetIds.value
  if (ids.length === 0) return

  checking.value = true
  finished.value = false
  totalCount.value = ids.length
  checkedCount.value = 0
  results.value = []

  // 按 CHUNK_SIZE 分批请求，展示进度
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE)
    try {
      const response = await apiRequest('/api/bookmarks/check', {
        method: 'POST',
        body: JSON.stringify({ ids: chunk })
      })
      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data.results)) {
          results.value.push(...data.results)
        }
      } else {
        console.error('Link check batch failed:', response.status)
      }
    } catch (error) {
      console.error('Link check error:', error)
    }
    checkedCount.value = Math.min(i + CHUNK_SIZE, ids.length)
  }

  checking.value = false
  finished.value = true
  emit('checked')
}

defineExpose({ open })
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.dialog-box {
  background: var(--bg, #fff);
  border-radius: 12px;
  padding: 1.5rem;
  width: min(560px, 92vw);
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.dialog-title {
  margin: 0 0 1rem;
  font-size: 1.1rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  color: var(--text-secondary, #666);
  margin-bottom: 0.5rem;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.9rem;
}

.check-hint {
  font-size: 0.8125rem;
  color: var(--text-secondary, #888);
  line-height: 1.6;
}

.dialog-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.25rem;
}

.btn {
  padding: 0.5rem 1.25rem;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-primary {
  background: var(--primary, #3b82f6);
  color: #fff;
}

.btn-secondary {
  background: var(--border, #eee);
  color: var(--text, #333);
}

.btn-danger {
  background: #ef4444;
  color: #fff;
}

.btn-sm {
  padding: 0.25rem 0.75rem;
  font-size: 0.8rem;
}

.btn-ghost {
  background: transparent;
  border: 1px solid var(--border, #ddd);
  color: var(--text, #333);
}

.btn-ghost:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.result-actions {
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
}

.repair-box {
  background: var(--bg-secondary, #f7f7f9);
  border-top: 1px dashed var(--border, #e5e5e5);
  padding: 0.5rem 0.85rem 0.6rem;
  font-size: 0.8rem;
  line-height: 1.6;
  word-break: break-all;
}

.repair-row a {
  color: var(--primary, #3b82f6);
}

.repair-none {
  color: var(--text-secondary, #888);
}

.repair-reason {
  color: var(--text-secondary, #777);
}

.repair-error {
  color: #ef4444;
}

.progress-info {
  margin-bottom: 0.75rem;
  font-size: 0.95rem;
}

.progress-bar {
  height: 8px;
  border-radius: 4px;
  background: var(--border, #eee);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary, #3b82f6);
  transition: width 0.3s ease;
}

.result-summary {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 0.75rem;
  font-size: 0.95rem;
}

.result-filter {
  display: flex;
  gap: 1.25rem;
  margin-bottom: 0.75rem;
}

.result-list {
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid var(--border, #eee);
  border-radius: 8px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.85rem;
  border-bottom: 1px solid var(--border, #f0f0f0);
}

.result-item:last-child {
  border-bottom: none;
}

.result-status {
  flex-shrink: 0;
  font-size: 0.85rem;
  min-width: 110px;
}

.result-status small {
  display: block;
  color: var(--text-secondary, #888);
}

.result-info {
  flex: 1;
  min-width: 0;
}

.result-name {
  font-size: 0.9rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-url {
  font-size: 0.78rem;
  color: var(--text-secondary, #888);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
