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
defineProps({
  totalBookmarks: Number,
  privateBookmarks: Number,
  emptyCategoryCount: {
    type: Number,
    default: 0
  }
})

defineEmits(['action'])
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
</style>
