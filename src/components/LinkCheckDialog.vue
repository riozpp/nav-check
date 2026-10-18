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
              检测将对每个书签的 URL 发起 HEAD 请求（失败时回退 GET），无法连接或返回
              4xx/5xx 的书签将被标记为失效。每次最多检测 30 个，多出的会自动分批进行。
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
                <button
                  v-if="!item.ok"
                  class="btn btn-danger btn-sm"
                  @click="$emit('deleteBookmark', item.id)"
                  title="删除该书签"
                >删除</button>
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
  checkedCount.value = 0
  resultFilter.value = 'all'
  // 默认选择更有意义的一档
  scope.value = uncheckedCount.value > 0 ? 'unchecked' : 'all'
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
