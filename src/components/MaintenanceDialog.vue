<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="dialog-overlay" @click="close">
        <div class="dialog-box maint-dialog" @click.stop>
          <h3 class="dialog-title">{{ title }}</h3>

          <!-- 书签数据体检 -->
          <div v-if="mode === 'health'" class="panel">
            <div v-if="loading" class="loading">正在扫描…</div>
            <template v-else>
              <div class="health-grid">
                <div class="health-card" :class="{ warn: health.noIcon > 0 }">
                  <div class="health-num">{{ health.noIcon }}</div>
                  <div class="health-label">缺少图标</div>
                  <button
                    class="btn btn-primary btn-sm"
                    :disabled="health.noIcon === 0 || running"
                    @click="fetchIcons"
                  >
                    {{ running && task === 'icon' ? `抓取中 ${progress}…` : '批量抓取' }}
                  </button>
                </div>
                <div class="health-card" :class="{ warn: health.noDesc > 0 }">
                  <div class="health-num">{{ health.noDesc }}</div>
                  <div class="health-label">缺少描述</div>
                  <button class="btn btn-secondary btn-sm" @click="$emit('aiDescriptions')">
                    去生成
                  </button>
                </div>
                <div class="health-card" :class="{ warn: health.noTags > 0 }">
                  <div class="health-num">{{ health.noTags }}</div>
                  <div class="health-label">缺少标签</div>
                  <button
                    class="btn btn-primary btn-sm"
                    :disabled="health.noTags === 0 || running"
                    @click="generateTags"
                  >
                    {{ running && task === 'tag' ? '生成中…' : 'AI 生成' }}
                  </button>
                </div>
                <div class="health-card" :class="{ warn: health.dead > 0 }">
                  <div class="health-num">{{ health.dead }}</div>
                  <div class="health-label">失效链接</div>
                  <div v-if="health.unknown > 0" class="health-sub">另有 {{ health.unknown }} 个无法确认</div>
                  <button class="btn btn-secondary btn-sm" @click="$emit('linkCheck')">
                    去检测
                  </button>
                </div>
                <div class="health-card" :class="{ warn: health.malformed > 0 }">
                  <div class="health-num">{{ health.malformed }}</div>
                  <div class="health-label">URL 畸形</div>
                  <button class="btn btn-secondary btn-sm" @click="openTab('malformed')">
                    去修复
                  </button>
                </div>
              </div>

              <div v-if="log" class="log-box">{{ log }}</div>
            </template>
          </div>

          <!-- 畸形 URL 修复 -->
          <div v-else-if="mode === 'malformed'" class="panel">
            <div v-if="loading" class="loading">正在扫描…</div>
            <template v-else-if="issues.length === 0">
              <p class="empty-tip">✅ 没有发现畸形 URL，数据很干净。</p>
            </template>
            <template v-else>
              <p class="hint">
                发现 <strong>{{ issues.length }}</strong> 条格式异常的 URL，其中
                <strong>{{ fixableCount }}</strong> 条可自动修复。
              </p>
              <div class="issue-list">
                <div v-for="issue in issues" :key="issue.id" class="issue-item">
                  <div class="issue-head">
                    <span class="issue-name">{{ issue.name }}</span>
                    <span class="issue-reason">{{ issue.reason }}</span>
                  </div>
                  <div class="issue-url">{{ issue.url }}</div>
                  <div v-if="issue.suggested" class="issue-fix">→ {{ issue.suggested }}</div>
                </div>
              </div>
              <div class="dialog-buttons">
                <button class="btn btn-secondary" @click="close">关闭</button>
                <button
                  class="btn btn-primary"
                  :disabled="fixableCount === 0 || running"
                  @click="applyFixes"
                >
                  {{ running ? '修复中…' : `一键修复 ${fixableCount} 条` }}
                </button>
              </div>
            </template>
          </div>

          <!-- 批量替换 URL -->
          <div v-else-if="mode === 'replace'" class="panel">
            <div class="form-group">
              <label>查找内容</label>
              <input v-model="replaceForm.find" type="text" placeholder="例如：192.168.31.49" />
            </div>
            <div class="form-group">
              <label>替换为</label>
              <input v-model="replaceForm.replace" type="text" placeholder="例如：192.168.0.155" />
            </div>
            <p class="hint">
              将修改所有 URL 中包含「查找内容」的书签。建议先点「预览」，确认无误后再执行。
            </p>

            <div v-if="replaceMatches.length > 0" class="match-list">
              <div class="match-head">将修改 {{ replaceMatches.length }} 条：</div>
              <div v-for="m in replaceMatches" :key="m.id" class="match-item">
                <div class="match-name">{{ m.name }}</div>
                <div class="match-url">{{ m.before }}</div>
                <div class="match-url match-after">→ {{ m.after }}</div>
                <div v-if="!m.valid" class="match-invalid">⚠️ 替换后 URL 不合法，将跳过</div>
              </div>
            </div>

            <div class="dialog-buttons">
              <button class="btn btn-secondary" @click="close">取消</button>
              <button class="btn btn-secondary" :disabled="!replaceForm.find || running" @click="previewReplace">
                预览
              </button>
              <button
                class="btn btn-primary"
                :disabled="!replaceForm.find || replaceMatches.length === 0 || running"
                @click="doReplace"
              >
                {{ running ? '执行中…' : '执行替换' }}
              </button>
            </div>
          </div>

          <!-- 失效书签清理 -->
          <div v-else-if="mode === 'dead'" class="panel">
            <p class="hint">
              共 <strong>{{ deadList.length }}</strong> 个失效书签。建议先导出留档，确认无误后再批量删除。
            </p>
            <div class="dead-list">
              <label v-for="item in deadList" :key="item.id" class="dead-item">
                <input type="checkbox" :value="item.id" v-model="selectedDead" />
                <div class="dead-info">
                  <div class="dead-name">{{ item.name }}</div>
                  <div class="dead-url">{{ item.url }}</div>
                </div>
                <span class="dead-code">{{ item.check_code || 'ERR' }}</span>
              </label>
            </div>
            <div class="dialog-buttons">
              <button class="btn btn-secondary" @click="close">取消</button>
              <button class="btn btn-secondary" :disabled="deadList.length === 0" @click="exportDead">
                导出 {{ deadList.length }} 条
              </button>
              <button
                class="btn btn-danger"
                :disabled="selectedDead.length === 0 || running"
                @click="deleteDead"
              >
                {{ running ? '删除中…' : `删除选中 ${selectedDead.length} 条` }}
              </button>
            </div>
          </div>

          <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuth } from '../composables/useAuth'
import { useBookmarks } from '../composables/useBookmarks'
import { useToast } from '../composables/useToast'

const emit = defineEmits(['aiDescriptions', 'linkCheck', 'refresh'])

const { apiRequest } = useAuth()
const { bookmarks, deleteBookmark } = useBookmarks()
const { success: toastSuccess, error: toastError } = useToast()

const show = ref(false)
const mode = ref('health')
const title = ref('书签数据体检')
const loading = ref(false)
const running = ref(false)
const task = ref('')
const progress = ref(0)
const log = ref('')
const errorMsg = ref('')

const health = ref({ noIcon: 0, noDesc: 0, noTags: 0, dead: 0, unknown: 0, malformed: 0 })
const issues = ref([])
const replaceForm = ref({ find: '', replace: '' })
const replaceMatches = ref([])
const deadList = ref([])
const selectedDead = ref([])

const fixableCount = computed(() => issues.value.filter(i => i.suggested).length)

const open = async (target = 'health') => {
  show.value = true
  errorMsg.value = ''
  log.value = ''
  replaceMatches.value = []
  selectedDead.value = []
  if (target === 'malformed') {
    await openTab('malformed')
  } else if (target === 'replace') {
    mode.value = 'replace'
    title.value = '批量替换 URL'
  } else if (target === 'dead') {
    await openTab('dead')
  } else {
    await openTab('health')
  }
}

const openTab = async (tab) => {
  mode.value = tab
  loading.value = true
  errorMsg.value = ''
  title.value = {
    health: '书签数据体检',
    malformed: '畸形 URL 修复',
    replace: '批量替换 URL',
    dead: '失效书签清理'
  }[tab]

  try {
    if (tab === 'health') {
      health.value = {
        noIcon: bookmarks.value.filter(b => !b.icon).length,
        noDesc: bookmarks.value.filter(b => !b.description).length,
        noTags: bookmarks.value.filter(b => !b.tags || !b.tags.trim()).length,
        dead: bookmarks.value.filter(b => b.check_status === 'fail').length,
        unknown: bookmarks.value.filter(b => b.check_status === 'unknown').length,
        malformed: issues.value.length
      }
      // 顺便扫描一次畸形 URL，但不阻塞
      scanMalformed()
    } else if (tab === 'malformed') {
      await scanMalformed()
    } else if (tab === 'dead') {
      deadList.value = bookmarks.value.filter(b => b.check_status === 'fail')
    }
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    loading.value = false
  }
}

const scanMalformed = async () => {
  try {
    const response = await apiRequest('/api/bookmarks/clean-urls')
    if (response.ok) {
      const data = await response.json()
      issues.value = data.issues || []
      health.value.malformed = issues.value.length
    }
  } catch {
    // 忽略，不影响主流程
  }
}

// 批量抓取图标，按批推进直到拿不到剩余量
const fetchIcons = async () => {
  running.value = true
  task.value = 'icon'
  progress.value = 0
  log.value = ''
  let totalUpdated = 0
  try {
    for (let round = 0; round < 20; round++) {
      const response = await apiRequest('/api/bookmarks/batch-fetch-icons', {
        method: 'POST',
        body: JSON.stringify({ limit: 40 })
      })
      const data = await response.json()
      if (!data.success) throw new Error(data.error || '抓取失败')
      totalUpdated += data.updated
      progress.value += data.updated
      log.value = `已更新 ${totalUpdated} 个图标，剩余 ${data.remaining} 个…`
      if (data.remaining === 0 || data.total === 0) break
    }
    toastSuccess(`图标抓取完成，共更新 ${totalUpdated} 个`)
    emit('refresh')
    await openTab('health')
  } catch (err) {
    toastError(err.message)
  } finally {
    running.value = false
    task.value = ''
  }
}

// AI 批量生成标签（每批 10 个，控制 token 消耗）
const generateTags = async () => {
  running.value = true
  task.value = 'tag'
  log.value = ''
  const targets = bookmarks.value
    .filter(b => !b.tags || !b.tags.trim())
    .slice(0, 50)
  if (targets.length === 0) {
    running.value = false
    task.value = ''
    return
  }

  let done = 0
  try {
    for (let i = 0; i < targets.length; i += 10) {
      const chunk = targets.slice(i, i + 10).map(b => ({
        id: b.id,
        name: b.name,
        url: b.url,
        description: b.description || ''
      }))
      const response = await apiRequest('/api/ai/batch-generate-tags', {
        method: 'POST',
        body: JSON.stringify({ bookmarks: chunk })
      })
      const data = await response.json()
      if (!data.success) throw new Error(data.error || '生成失败')

      // 逐条写回标签
      for (const item of data.results) {
        const bookmark = bookmarks.value.find(b => b.id === item.id)
        if (!bookmark) continue
        await apiRequest(`/api/bookmarks/${item.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: bookmark.name,
            url: bookmark.url,
            description: bookmark.description,
            icon: bookmark.icon,
            category_id: bookmark.category_id,
            is_private: bookmark.is_private,
            tags: item.tags,
            notes: bookmark.notes
          })
        })
        bookmark.tags = item.tags
        done++
      }
      log.value = `已生成 ${done} 个标签…`
    }
    toastSuccess(`已为 ${done} 个书签生成标签`)
    emit('refresh')
  } catch (err) {
    toastError(err.message)
  } finally {
    running.value = false
    task.value = ''
  }
}

const applyFixes = async () => {
  running.value = true
  try {
    const items = issues.value.filter(i => i.suggested).map(i => ({ id: i.id, url: i.suggested }))
    const response = await apiRequest('/api/bookmarks/clean-urls', {
      method: 'POST',
      body: JSON.stringify({ items })
    })
    const data = await response.json()
    if (data.success) {
      toastSuccess(`已修复 ${data.updated} 条 URL`)
      emit('refresh')
      await scanMalformed()
    } else {
      toastError(data.error)
    }
  } catch (err) {
    toastError(err.message)
  } finally {
    running.value = false
  }
}

const previewReplace = async () => {
  running.value = true
  errorMsg.value = ''
  try {
    const response = await apiRequest('/api/bookmarks/batch-replace-url', {
      method: 'POST',
      body: JSON.stringify({ ...replaceForm.value, dryRun: true })
    })
    const data = await response.json()
    if (data.success) {
      replaceMatches.value = data.matches || []
    } else {
      errorMsg.value = data.error
    }
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    running.value = false
  }
}

const doReplace = async () => {
  running.value = true
  try {
    const response = await apiRequest('/api/bookmarks/batch-replace-url', {
      method: 'POST',
      body: JSON.stringify(replaceForm.value)
    })
    const data = await response.json()
    if (data.success) {
      toastSuccess(`已更新 ${data.updated} 条，跳过 ${data.skipped} 条`)
      emit('refresh')
      close()
    } else {
      toastError(data.error)
    }
  } catch (err) {
    toastError(err.message)
  } finally {
    running.value = false
  }
}

// 导出失效书签为 JSON，便于留档后再删
const exportDead = () => {
  const payload = deadList.value.map(b => ({
    name: b.name,
    url: b.url,
    category_id: b.category_id,
    check_code: b.check_code,
    check_time: b.check_time
  }))
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `dead-bookmarks-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
  toastSuccess('已导出')
}

const deleteDead = async () => {
  running.value = true
  let deleted = 0
  try {
    for (const id of selectedDead.value) {
      const result = await deleteBookmark(id)
      if (result.success) deleted++
    }
    toastSuccess(`已删除 ${deleted} 个失效书签`)
    emit('refresh')
    await openTab('dead')
  } catch (err) {
    toastError(err.message)
  } finally {
    running.value = false
  }
}

const close = () => {
  show.value = false
}

defineExpose({ open, close })
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
  width: min(720px, 94vw);
  max-height: 84vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.dialog-title {
  margin: 0 0 1rem;
  font-size: 1.1rem;
}

.health-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.75rem;
}

.health-card {
  border: 1px solid var(--border, #eee);
  border-radius: 10px;
  padding: 0.85rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.health-card.warn {
  border-color: #fbbf24;
  background: rgba(251, 191, 36, 0.06);
}

.health-num {
  font-size: 1.5rem;
  font-weight: 700;
}

.health-sub {
  font-size: 0.7rem;
  color: #9ca3af;
  margin-bottom: 0.3rem;
}

.health-label {
  font-size: 0.8rem;
  color: var(--text-secondary, #777);
  margin-bottom: 0.35rem;
}

.btn {
  padding: 0.5rem 1.25rem;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-sm {
  padding: 0.3rem 0.6rem;
  font-size: 0.78rem;
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

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.log-box {
  margin-top: 1rem;
  padding: 0.6rem 0.85rem;
  background: var(--bg-secondary, #f7f7f9);
  border-radius: 8px;
  font-size: 0.82rem;
  color: var(--text-secondary, #666);
}

.hint {
  font-size: 0.85rem;
  color: var(--text-secondary, #777);
  margin-bottom: 0.75rem;
}

.empty-tip {
  text-align: center;
  color: #16a34a;
  padding: 2rem 0;
}

.issue-list,
.match-list,
.dead-list {
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid var(--border, #eee);
  border-radius: 8px;
}

.issue-item,
.match-item {
  padding: 0.6rem 0.85rem;
  border-bottom: 1px solid var(--border, #f2f2f2);
  font-size: 0.85rem;
}

.issue-head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.issue-name {
  font-weight: 500;
}

.issue-reason {
  color: #f59e0b;
  font-size: 0.78rem;
}

.issue-url {
  color: var(--text-secondary, #888);
  font-size: 0.78rem;
  word-break: break-all;
}

.issue-fix {
  color: #16a34a;
  font-size: 0.78rem;
  word-break: break-all;
  margin-top: 0.2rem;
}

.match-head {
  padding: 0.5rem 0.85rem;
  font-size: 0.8rem;
  color: var(--text-secondary, #777);
  border-bottom: 1px solid var(--border, #eee);
}

.match-name {
  font-weight: 500;
  margin-bottom: 0.15rem;
}

.match-url {
  font-size: 0.76rem;
  color: var(--text-secondary, #888);
  word-break: break-all;
}

.match-after {
  color: #16a34a;
}

.match-invalid {
  color: #ef4444;
  font-size: 0.76rem;
}

.dead-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.85rem;
  border-bottom: 1px solid var(--border, #f2f2f2);
  cursor: pointer;
  font-size: 0.85rem;
}

.dead-info {
  flex: 1;
  min-width: 0;
}

.dead-name {
  font-weight: 500;
}

.dead-url {
  font-size: 0.76rem;
  color: var(--text-secondary, #888);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dead-code {
  font-size: 0.75rem;
  color: #ef4444;
  flex-shrink: 0;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.85rem;
  color: var(--text-secondary, #666);
  margin-bottom: 0.4rem;
}

.form-group input {
  width: 100%;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
  background: transparent;
  color: var(--text, #333);
  font-size: 0.88rem;
  box-sizing: border-box;
}

.dialog-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 1.1rem;
}

.loading {
  text-align: center;
  padding: 2rem 0;
  color: var(--text-secondary, #888);
}

.error-msg {
  margin-top: 0.75rem;
  color: #ef4444;
  font-size: 0.85rem;
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
