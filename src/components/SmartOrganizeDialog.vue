<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="modal-overlay" @click.self="close">
        <div class="modal-content" role="dialog" aria-modal="true">
          <div class="modal-header">
            <h3>AI 智能分类</h3>
            <button class="close-btn" @click="close" :disabled="running" aria-label="关闭">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div class="modal-body">
            <div v-if="!running && !done" class="confirm-section">
              <p class="info-text">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4"/>
                  <path d="M12 8h.01"/>
                </svg>
                AI 将分析全部 <strong>{{ bookmarkTotal }}</strong> 个书签，自动设计一套分类并把每个书签归入最合适的分类
              </p>
              <ul class="tips">
                <li>已有分类会被尽量复用，缺少的会自动新建</li>
                <li>书签较多时耗时较长，请耐心等待</li>
                <li>操作不可撤销，建议先在「数据管理」中备份</li>
              </ul>
              <label v-if="uncategorizedCount > 0" class="checkbox-row">
                <input type="checkbox" v-model="onlyUncategorized" />
                <span>只分类「未分类」里的 {{ uncategorizedCount }} 个书签（不动已分好的）</span>
              </label>
            </div>

            <div v-if="running" class="running-section">
              <div class="spinner"></div>
              <p class="running-text">{{ stageText }}</p>
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: progressPercentage + '%' }"></div>
              </div>
              <p class="progress-text">{{ progressPercentage }}%（{{ doneChunks }} / {{ totalChunks }} 批）</p>
              <p v-if="lastError" class="chunk-error">最近一次批次失败：{{ lastError }}（会自动重试）</p>
              <p class="running-hint">每批约需 10~30 秒，请不要关闭页面</p>
            </div>

            <div v-if="done" class="done-section">
              <div class="done-icon" :class="{ ok: !errorMsg }">
                <svg v-if="!errorMsg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 8v4"/>
                  <path d="M12 16h.01"/>
                </svg>
              </div>
              <template v-if="!errorMsg">
                <h4>智能分类完成</h4>
                <p class="done-summary">
                  已归类 <strong>{{ result.assigned }}</strong> / {{ result.total }} 个书签，
                  新建 <strong>{{ result.categoriesCreated }}</strong> 个分类
                  <span v-if="result.failed > 0" class="fail-note">（{{ result.failed }} 个未能分类）</span>
                </p>
                <div v-if="failedChunkErrors.length" class="error-list">
                  <div v-for="(e, idx) in failedChunkErrors" :key="idx" class="error-item">{{ e }}</div>
                </div>
                <div v-if="result.categorySummary?.length" class="summary-list">
                  <div v-for="c in result.categorySummary" :key="c.name" class="summary-item">
                    <span>{{ c.name }}</span>
                    <span class="count">{{ c.count }}</span>
                  </div>
                </div>
              </template>
              <template v-else>
                <h4>智能分类失败</h4>
                <p class="error-text">{{ errorMsg }}</p>
              </template>
            </div>
          </div>

          <div class="modal-footer">
            <button v-if="!running && !done" class="btn btn-secondary" @click="close">取消</button>
            <button
              v-if="!running && !done"
              class="btn btn-primary"
              @click="start"
              :disabled="bookmarkTotal === 0"
            >
              开始智能分类
            </button>
            <button v-if="done" class="btn btn-primary" @click="close">完成</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAI } from '../composables/useAI'
import { useBookmarks } from '../composables/useBookmarks'
import { useToast } from '../composables/useToast'
import { useAuth } from '../composables/useAuth'
import { buildCategoryTree, getCategoryPath } from '../utils/categoryTree'

const emit = defineEmits(['completed'])

const { smartOrganizeChunk, smartOrganizeApply } = useAI()
const { bookmarks, categories } = useBookmarks()
const { refreshToken, isAuthenticated } = useAuth()
const { success: toastSuccess, error: toastError } = useToast()

const CHUNK_SIZE = 24

const show = ref(false)
const running = ref(false)
const done = ref(false)
const result = ref(null)
const errorMsg = ref('')
const onlyUncategorized = ref(false)

const doneChunks = ref(0)
const totalChunks = ref(0)
const lastError = ref('')
const failedChunkErrors = ref([])

const bookmarkTotal = computed(() => bookmarks.value.length)

// 「未分类」（顶级）里的书签数量
const uncategorizedCount = computed(() => {
  const unc = categories.value.find(c => c.depth === 0 && c.name === '未分类')
  if (!unc) return 0
  return bookmarks.value.filter(b => b.category_id === unc.id).length
})
const progressPercentage = computed(() => {
  if (totalChunks.value === 0) return 0
  return Math.round((doneChunks.value / totalChunks.value) * 100)
})

const stageText = computed(() => {
  if (doneChunks.value >= totalChunks.value && totalChunks.value > 0) return '正在创建分类并写入结果…'
  return 'AI 正在分析书签并设计分类…'
})

const open = () => {
  show.value = true
  running.value = false
  done.value = false
  result.value = null
  errorMsg.value = ''
  doneChunks.value = 0
  totalChunks.value = 0
  lastError.value = ''
  failedChunkErrors.value = []
  onlyUncategorized.value = uncategorizedCount.value > 0 && uncategorizedCount.value === bookmarkTotal.value
}

const close = () => {
  if (running.value) return
  show.value = false
}

// 现有分类的完整路径，供 AI 复用
const prepareExistingCategories = () => {
  if (!categories.value.length) return []
  const { flatList, map } = buildCategoryTree(categories.value)
  return flatList
    .filter(c => c.name !== '未分类')
    .map(cat => getCategoryPath(cat.id, map).map(c => c.name).join(' / '))
}

const start = async () => {
  running.value = true

  try {
    // 开跑前先续期 token，拿到全新的有效期窗口
    if (isAuthenticated.value) await refreshToken()

    // 目标书签：全部，或仅「未分类」里的
    let list = bookmarks.value
    if (onlyUncategorized.value) {
      const unc = categories.value.find(c => c.depth === 0 && c.name === '未分类')
      if (unc) list = list.filter(b => b.category_id === unc.id)
    }
    list = list.map(b => ({
      id: b.id,
      name: b.name,
      url: b.url,
      description: b.description || ''
    }))
    const existingPaths = prepareExistingCategories()

    // 已用分类名集合：现有顶级分类名 + 各批次产生的名字，逐批传给 AI 强制复用
    const knownNames = new Set(
      categories.value.filter(c => c.depth === 0 && c.name !== '未分类').map(c => c.name)
    )

    totalChunks.value = Math.ceil(list.length / CHUNK_SIZE)
    doneChunks.value = 0

    const assign = {}
    let failedCount = 0
    let lastChunkError = ''
    const failedChunkErrorsLocal = []

    for (let i = 0; i < list.length; i += CHUNK_SIZE) {
      const chunk = list.slice(i, i + CHUNK_SIZE)
      const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1

      let res = null
      // 最多尝试 3 次，指数退避
      for (let attempt = 1; attempt <= 3; attempt++) {
        res = await smartOrganizeChunk(chunk, existingPaths, [...knownNames])

        if (res.success) break

        // 登录过期：续期后重试
        if (res.error && res.error.includes('登录已过期')) {
          const refreshed = await refreshToken()
          if (refreshed) {
            res = await smartOrganizeChunk(chunk, existingPaths, [...knownNames])
          }
        }

        if (res.success) break
        if (attempt < 3) {
          lastError.value = `第 ${chunkIndex} 批第 ${attempt} 次失败：${res.error}，重试中…`
          await new Promise(resolve => setTimeout(resolve, attempt * 2500))
        }
      }

      if (res && res.success) {
        Object.assign(assign, res.assign)
        ;(res.categories || []).forEach(n => knownNames.add(n))
        lastError.value = ''
      } else {
        failedCount += chunk.length
        const msg = `第 ${chunkIndex} 批：${(res && res.error) || '未知错误'}`
        failedChunkErrorsLocal.push(msg)
        lastError.value = msg
        console.warn('智能分类批次失败:', msg)
      }

      doneChunks.value++
      // 批次间稍作停顿，避免触发 API 速率限制
      if (i + CHUNK_SIZE < list.length) {
        await new Promise(resolve => setTimeout(resolve, 400))
      }
    }

    if (Object.keys(assign).length === 0) {
      running.value = false
      done.value = true
      errorMsg.value = 'AI 未能生成分类方案，请检查 AI 配置后重试'
      return
    }

    // 应用：创建分类 + 写回书签
    const applyRes = await smartOrganizeApply(assign)
    running.value = false
    done.value = true

    if (applyRes.success) {
      result.value = {
        ...applyRes,
        total: list.length,
        failed: failedCount + (list.length - Object.keys(assign).length)
      }
      failedChunkErrors.value = failedChunkErrorsLocal
      if (failedCount > 0) {
        toastSuccess(`智能分类基本完成：归类 ${applyRes.assigned} 个，${failedCount} 个未分上`)
      } else {
        toastSuccess(`智能分类完成：归类 ${applyRes.assigned} 个书签，新建 ${applyRes.categoriesCreated} 个分类`)
      }
      emit('completed')
    } else {
      errorMsg.value = applyRes.error || '写入失败'
      toastError(errorMsg.value)
    }
  } catch (e) {
    running.value = false
    done.value = true
    errorMsg.value = e.message || '网络错误'
    toastError(errorMsg.value)
  }
}

defineExpose({ open, close })
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 1rem;
}

.modal-content {
  background: var(--bg);
  border-radius: var(--radius);
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--border);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text);
}

.close-btn {
  background: none;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
}

.close-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.close-btn svg {
  width: 20px;
  height: 20px;
  stroke-width: 2;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.info-text {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--info-bg, rgba(59, 130, 246, 0.08));
  border: 1px solid var(--info-border, rgba(59, 130, 246, 0.25));
  border-radius: var(--radius);
  color: var(--text);
  margin: 0;
}

.info-text svg {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  stroke-width: 2;
  color: var(--primary);
}

.info-text strong {
  color: var(--primary);
}

.tips {
  margin: 1rem 0 0 0;
  padding-left: 1.25rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
  line-height: 1.8;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.875rem;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--text);
}

.checkbox-row input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--primary);
}

.running-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem 0;
}

.spinner {
  width: 44px;
  height: 44px;
  border: 4px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.running-text {
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.running-hint {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin: 0;
}

.progress-bar {
  width: 100%;
  height: 10px;
  background: var(--border);
  border-radius: 999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), var(--primary-dark));
  border-radius: 999px;
  transition: width 0.4s ease;
}

.progress-text {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--primary);
  margin: 0;
}

.chunk-error {
  font-size: 0.8125rem;
  color: #d97706;
  margin: 0;
  text-align: center;
  max-width: 100%;
  word-break: break-all;
}

.fail-note {
  color: #d97706;
}

.error-list {
  width: 100%;
  max-height: 120px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 0.25rem;
}

.error-item {
  font-size: 0.8125rem;
  color: #d97706;
  text-align: left;
  padding: 0.375rem 0.75rem;
  background: rgba(217, 119, 6, 0.08);
  border-radius: var(--radius-sm);
  word-break: break-all;
}

.done-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  text-align: center;
}

.done-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.done-icon.ok {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.done-icon svg {
  width: 32px;
  height: 32px;
  stroke-width: 2;
}

.done-section h4 {
  margin: 0;
  font-size: 1.15rem;
  color: var(--text);
}

.done-summary {
  margin: 0;
  color: var(--text-secondary);
}

.done-summary strong {
  color: var(--primary);
}

.error-text {
  margin: 0;
  color: #dc2626;
  font-size: 0.9375rem;
}

.summary-list {
  width: 100%;
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: 0.5rem;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0.875rem;
  background: var(--bg-secondary, rgba(0, 0, 0, 0.03));
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  color: var(--text);
}

.summary-item .count {
  color: var(--text-secondary);
}

.modal-footer {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  padding: 1.25rem 1.5rem;
  border-top: 1px solid var(--border);
}

.btn {
  padding: 0.65rem 1.4rem;
  border-radius: var(--radius);
  font-weight: 500;
  cursor: pointer;
  border: none;
  font-size: 0.9375rem;
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-dark);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text);
  border: 1px solid var(--border);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
