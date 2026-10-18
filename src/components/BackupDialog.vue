<template>
  <Teleport to="body">
    <ConfirmDialog ref="confirmDialog" />
    <PromptDialog ref="promptDialog" />
    <Transition name="fade">
      <div v-if="show" class="dialog-overlay" @click="close">
        <div class="dialog-box backup-dialog" @click.stop>
          <h3 class="dialog-title">备份与恢复</h3>
          
          <!-- 加载状态 -->
          <div v-if="loading" class="loading-state">
            <span class="spinner"></span>
            <span>加载中...</span>
          </div>
          
          <!-- R2 未配置时只显示配置提示 -->
          <div v-else-if="!r2Configured" class="r2-not-configured">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div class="notice-content">
              <h4>R2 存储未配置</h4>
              <p>备份功能需要配置 Cloudflare R2 存储。请按照以下步骤配置：</p>
              <ol>
                <li>在 Cloudflare R2 创建（名称：<code>bookmark-backups</code>）</li>
                <li>取消 <code>wrangler.toml</code> 中 R2 配置的注释</li>
                <li>重试部署</li>
              </ol>
            </div>
          </div>
          
          <!-- R2 已配置时显示完整功能 -->
          <template v-else>
            <!-- 创建备份 -->
            <div class="backup-section">
              <h4>创建备份</h4>
              <p class="section-description">将当前所有书签数据备份到云端存储</p>
              <button 
                class="btn btn-primary" 
                @click="handleCreateBackup"
                :disabled="creating"
              >
                <svg v-if="!creating" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
                <span v-else class="spinner"></span>
                {{ creating ? '创建中...' : '创建备份' }}
              </button>
              <p class="backup-hint">点击按钮后可以输入自定义备份名称，留空则使用默认名称</p>
            </div>
            
            <!-- 备份列表 -->
            <div class="backup-list-section">
              <div class="section-header">
                <h4>备份列表</h4>
                <button 
                  class="btn-refresh" 
                  @click="loadBackups"
                  :disabled="loading"
                  title="刷新列表"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline points="23 4 23 10 17 10"/>
                    <polyline points="1 20 1 14 7 14"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                </button>
              </div>
              
              <div v-if="backups.length === 0" class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
                <p>暂无备份</p>
              </div>
              
              <div v-else class="backup-list">
                <div 
                  v-for="backup in backups" 
                  :key="backup.key" 
                  class="backup-item"
                >
                  <div class="backup-info">
                    <!-- 显示自定义名称或文件名 -->
                    <div class="backup-name">
                      {{ backup.customMetadata?.name || backup.key }}
                    </div>
                    <div class="backup-meta">
                      <span class="backup-date">{{ formatDate(backup.uploaded) }}</span>
                      <span class="backup-size">{{ formatFileSize(backup.size) }}</span>
                      <span 
                        v-if="backup.customMetadata?.categoryCount" 
                        class="backup-stats"
                      >
                        {{ backup.customMetadata.categoryCount }} 分类, 
                        {{ backup.customMetadata.bookmarkCount }} 书签
                      </span>
                    </div>
                    <!-- 如果文件名和显示名称不同，显示文件名 -->
                    <div v-if="backup.customMetadata?.name && backup.customMetadata.name !== backup.key" class="backup-filename">
                      {{ backup.key }}
                    </div>
                  </div>
                  <div class="backup-actions">
                    <button 
                      class="btn-action btn-download"
                      @click="handleDownloadBackup(backup.key)"
                      title="下载备份"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                    </button>
                    <button 
                      class="btn-action btn-restore"
                      @click="handleRestoreBackup(backup.key)"
                      :disabled="restoring"
                      title="恢复备份"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                        <path d="M21 3v5h-5"/>
                        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                        <path d="M3 21v-5h5"/>
                      </svg>
                    </button>
                    <button 
                      class="btn-action btn-delete"
                      @click="handleDeleteBackup(backup.key)"
                      title="删除备份"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 恢复提示 -->
            <div v-if="restoring" class="restore-notice">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4m0-4h.01"/>
              </svg>
              <span>正在恢复备份，请稍候...</span>
            </div>
          </template>
          
          <div class="dialog-buttons">
            <button class="btn btn-secondary" @click="close">关闭</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useBackup } from '../composables/useBackup'
import { useBookmarks } from '../composables/useBookmarks'
import ConfirmDialog from './ConfirmDialog.vue'
import PromptDialog from './PromptDialog.vue'

const { 
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
} = useBackup()

const { fetchData } = useBookmarks()

const show = ref(false)
const confirmDialog = ref(null)
const promptDialog = ref(null)
const r2Configured = ref(false) // 默认未配置，加载后根据实际情况更新

const open = async () => {
  show.value = true
  await loadBackups()
}

const close = () => {
  show.value = false
}

const loadBackups = async () => {
  const result = await listBackups()
  // 检查是否是 R2 未配置
  if (result.code === 'R2_NOT_CONFIGURED' || result.r2Configured === false) {
    r2Configured.value = false
  } else {
    r2Configured.value = true
  }
}

const handleCreateBackup = async () => {
  // 如果 R2 未配置，直接返回
  if (!r2Configured.value) {
    return
  }
  
  // 弹出输入对话框，让用户输入备份名称
  const backupName = await promptDialog.value.open(
    '输入备份名称（可选）',
    '',
    '留空将使用默认名称（时间戳），最多50个字符'
  )
  
  // 如果用户取消（返回 null），则不创建备份
  if (backupName === null) {
    return
  }
  
  // 如果用户输入了空字符串，则使用默认名称（传递 null）
  // 如果用户输入了内容，则使用用户输入的名称
  const name = backupName === '' ? null : backupName
  
  // 创建备份
  const result = await createBackup(name)
  if (result.success) {
    await loadBackups()
  }
}

const handleDownloadBackup = async (backupKey) => {
  await downloadBackup(backupKey)
}

const handleRestoreBackup = async (backupKey) => {
  // 确认恢复
  const confirmed = await confirmDialog.value.open(
    '确定要恢复这个备份吗？恢复操作会将备份中的数据导入到当前数据库中，已存在的书签和分类会被跳过。',
    '恢复备份'
  )
  
  if (!confirmed) return
  
  const result = await restoreBackup(backupKey)
  if (result.success) {
    // 刷新数据
    await fetchData()
    await loadBackups()
  }
}

const handleDeleteBackup = async (backupKey) => {
  // 确认删除
  const confirmed = await confirmDialog.value.open(
    '确定要删除这个备份吗？此操作不可恢复。',
    '删除备份'
  )
  
  if (!confirmed) return
  
  await deleteBackup(backupKey)
}

onMounted(() => {
  // 组件挂载时加载备份列表
  if (show.value) {
    loadBackups()
  }
})

defineExpose({
  open,
  close
})
</script>

<style scoped>
.backup-dialog {
  max-width: 700px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.backup-section,
.backup-list-section {
  margin-bottom: 1.5rem;
}

.backup-section h4,
.backup-list-section h4 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--text);
}

.section-description {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.btn-refresh {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.5rem;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-refresh:hover:not(:disabled) {
  background: var(--hover-bg);
  color: var(--primary);
}

.btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-refresh svg {
  width: 18px;
  height: 18px;
  stroke-width: 2;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-primary svg {
  width: 18px;
  height: 18px;
  stroke-width: 2;
}

.spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: var(--text-secondary);
  gap: 1rem;
}

.loading-state {
  gap: 0.5rem;
}

.empty-state svg {
  width: 48px;
  height: 48px;
  stroke-width: 1.5;
  opacity: 0.5;
}

.backup-list {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.5rem;
}

.backup-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  border-bottom: 1px solid var(--border);
  transition: background 0.2s;
}

.backup-item:last-child {
  border-bottom: none;
}

.backup-item:hover {
  background: var(--hover-bg);
  border-radius: var(--radius-sm);
}

.backup-info {
  flex: 1;
  min-width: 0;
}

.backup-name {
  font-weight: 500;
  color: var(--text);
  margin-bottom: 0.25rem;
  word-break: break-all;
}

.backup-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.backup-date,
.backup-size,
.backup-stats {
  display: flex;
  align-items: center;
}

.backup-actions {
  display: flex;
  gap: 0.5rem;
  margin-left: 1rem;
}

.btn-action {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.5rem;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
}

.btn-action:hover:not(:disabled) {
  background: var(--hover-bg);
  border-color: var(--primary);
  color: var(--primary);
}

.btn-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-action svg {
  width: 16px;
  height: 16px;
  stroke-width: 2;
}

.btn-restore {
  color: var(--primary);
}

.btn-restore:hover:not(:disabled) {
  background: var(--primary);
  color: white;
}

.btn-delete {
  color: var(--danger);
}

.btn-delete:hover:not(:disabled) {
  background: var(--danger);
  color: white;
  border-color: var(--danger);
}

.restore-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(59, 130, 246, 0.1);
  border-radius: var(--radius-sm);
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: var(--primary);
}

.restore-notice svg {
  width: 18px;
  height: 18px;
  stroke-width: 2;
  flex-shrink: 0;
}

.dialog-buttons {
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.backup-hint {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.5rem;
  margin-bottom: 0;
  text-align: center;
}

.backup-hint-disabled {
  color: #f59e0b;
}

.backup-filename {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
  font-family: monospace;
  opacity: 0.7;
}

.r2-not-configured {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 2rem;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: var(--radius);
  margin: 1rem 0;
}

.r2-not-configured svg {
  width: 24px;
  height: 24px;
  stroke-width: 2;
  flex-shrink: 0;
  margin-top: 0.25rem;
  color: #f59e0b;
}

.notice-content {
  flex: 1;
}

.notice-content h4 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: #f59e0b;
}

.notice-content p {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
  line-height: 1.6;
}

.notice-content ol {
  padding-left: 1.5rem;
  margin: 0.75rem 0 0;
  color: var(--text-secondary);
}

.notice-content li {
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
  line-height: 1.6;
}

.notice-content li:last-child {
  margin-bottom: 0;
}

.notice-content code {
  background: rgba(0, 0, 0, 0.1);
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-sm);
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.8125rem;
  color: var(--text);
}

.notice-hint {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  font-style: italic;
  margin-top: 0.5rem;
  margin-bottom: 0;
}

/* 深色模式下的调整 */
@media (prefers-color-scheme: dark) {
  .r2-not-configured {
    background: rgba(251, 191, 36, 0.15);
    border-color: rgba(251, 191, 36, 0.4);
  }
  
  .notice-content code {
    background: rgba(255, 255, 255, 0.1);
  }
}
</style>

