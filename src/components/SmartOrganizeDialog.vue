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
                <li>书签较多时耗时较长（约每 40 个书签 10~20 秒），请耐心等待</li>
                <li>操作不可撤销，建议先在「数据管理」中备份</li>
              </ul>
            </div>

            <div v-if="running" class="running-section">
              <div class="spinner"></div>
              <p class="running-text">{{ stageText }}</p>
              <p class="running-hint">书签越多耗时越久，请不要关闭页面</p>
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
                </p>
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

const emit = defineEmits(['completed'])

const { smartOrganize } = useAI()
const { bookmarks } = useBookmarks()
const { success: toastSuccess } = useToast()

const show = ref(false)
const running = ref(false)
const done = ref(false)
const result = ref(null)
const errorMsg = ref('')

const bookmarkTotal = computed(() => bookmarks.value.length)

const stageTexts = [
  '正在读取书签…',
  'AI 正在分析书签内容…',
  '正在设计分类结构…',
  '正在归类书签…'
]
const stageIndex = ref(0)
const stageText = computed(() => stageTexts[Math.min(stageIndex.value, stageTexts.length - 1)])

const open = () => {
  show.value = true
  running.value = false
  done.value = false
  result.value = null
  errorMsg.value = ''
  stageIndex.value = 0
}

const close = () => {
  if (running.value) return
  show.value = false
}

const start = async () => {
  running.value = true
  // 轮播提示语，让等待过程不那么枯燥
  const timer = setInterval(() => {
    if (stageIndex.value < stageTexts.length - 1) stageIndex.value++
  }, 8000)

  try {
    const res = await smartOrganize()
    clearInterval(timer)
    running.value = false
    done.value = true
    if (res.success) {
      result.value = res
      toastSuccess(`智能分类完成：归类 ${res.assigned} 个书签，新建 ${res.categoriesCreated} 个分类`)
      emit('completed')
    } else {
      errorMsg.value = res.error || '未知错误'
    }
  } catch (e) {
    clearInterval(timer)
    running.value = false
    done.value = true
    errorMsg.value = e.message || '网络错误'
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
