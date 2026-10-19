<template>
  <div class="settings-section">
    <h2 class="section-title">外观设置</h2>
    
    <!-- 头像设置 -->
    <div class="form-group">
      <label class="form-label">头像设置</label>
      <div class="avatar-settings">
        <div class="avatar-preview">
          <img 
            :src="avatarUrl || defaultAvatarIcon" 
            alt="当前头像"
          />
        </div>
        <div class="avatar-actions">
          <button type="button" class="avatar-btn avatar-btn-upload" @click="handleUploadAvatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            上传头像
          </button>
        </div>
      </div>
      <div class="form-hint">上传自定义头像，图片大小不超过 2MB</div>
      <input 
        ref="avatarInput" 
        type="file" 
        accept="image/*" 
        style="display: none" 
        @change="handleAvatarChange"
      />
    </div>
    
    <!-- 自定义标题 -->
    <div class="form-group">
      <label class="form-label">自定义标题</label>
      <div class="form-row">
        <input 
          type="text" 
          :value="customTitle" 
          class="form-input" 
          readonly
        />
        <button class="text-btn" @click="$emit('editTitle')">
          编辑
        </button>
      </div>
      <div class="form-hint">修改页面顶部标题文字</div>
    </div>
    
    <!-- 自定义页脚 -->
    <div class="form-group">
      <label class="form-label">自定义页脚</label>
      <div class="form-row">
        <div class="footer-preview" v-html="footerContent"></div>
        <button class="text-btn" @click="$emit('editFooter')">
          编辑
        </button>
      </div>
      <div class="form-hint">修改页面底部内容（支持HTML）</div>
    </div>
    
    <!-- 主题模式 -->
    <div class="form-group">
      <label class="form-label">主题模式</label>
      <div class="form-row">
        <select 
          class="form-select"
          :value="themeMode"
          @change="handleThemeChange"
        >
          <option value="light">🌞 亮色模式</option>
          <option value="dark">🌙 暗色模式</option>
          <option value="system">💻 跟随系统</option>
        </select>
      </div>
      <div class="form-hint">
        {{ 
          themeMode === 'light' ? '使用亮色主题' : 
          themeMode === 'dark' ? '使用暗色主题' : 
          '根据系统设置自动切换主题'
        }}
      </div>
    </div>

    <!-- 主题风格 -->
    <div class="form-group">
      <label class="form-label">主题风格</label>
      <div class="form-row">
        <select 
          class="form-select"
          :value="themeStyle"
          @change="$emit('setThemeStyle', $event.target.value)"
        >
          <option value="default">✨ 默认风格</option>
          <option value="ios26">🚀 iOS 26 风格</option>
        </select>
      </div>
      <div class="form-hint">
        选择不同的界面视觉风格
      </div>
    </div>
    
    <!-- 显示模式 -->
    <div class="form-group">
      <label class="form-label">显示模式</label>
      <div class="form-row">
        <select 
          class="form-select"
          :value="displayMode"
          @change="handleDisplayModeChange"
        >
          <option value="standard">📋 标准模式</option>
          <option value="efficient">⚡ 高效模式</option>
        </select>
      </div>
      <div class="form-hint">
        {{ 
          displayMode === 'standard' ? '标准大小的书签卡片' : 
          '紧凑布局，单页显示更多内容'
        }}
      </div>
    </div>
    
    <!-- 书签排序方式 -->
    <div class="form-group">
      <label class="form-label">书签排序</label>
      <div class="form-row">
        <select
          class="form-select"
          :value="sortMode"
          @change="handleSortModeChange"
        >
          <option value="manual">↕️ 手动排序（拖拽）</option>
          <option value="clicks">🔥 最常访问</option>
          <option value="recent">🆕 最近添加</option>
          <option value="name">🔤 按名称</option>
        </select>
      </div>
      <div class="form-hint">
        {{ sortModeHint }}
      </div>
    </div>

    <!-- 显示搜索栏 -->
    <div class="form-group">
      <label class="form-label">显示搜索栏</label>
      <div class="form-row">
        <span class="form-text">{{ showSearch ? '已开启' : '已关闭' }}</span>
        <label class="switch">
          <input 
            type="checkbox" 
            :checked="showSearch"
            @change="$emit('toggleSearch')"
          >
          <span class="slider"></span>
        </label>
      </div>
      <div class="form-hint">在顶部显示搜索功能</div>
    </div>
    
    <!-- 搜索引擎列表开关 -->
    <div v-if="showSearch" class="form-group">
      <label class="form-label">搜索引擎列表</label>
      <div class="form-row">
        <span class="form-text">{{ enabledSearchEnginesPanel ? '已开启' : '已关闭' }}</span>
        <label class="switch">
          <input 
            type="checkbox" 
            :checked="enabledSearchEnginesPanel"
            @change="toggleSearchEnginesPanel"
          >
          <span class="slider"></span>
        </label>
      </div>
      <div class="form-hint">在搜索栏中显示快速搜索引擎列表</div>
    </div>
    
    <!-- 搜索引擎配置 -->
    <div v-if="showSearch && enabledSearchEnginesPanel" class="form-group">
      <label class="form-label">快速搜索引擎</label>
      <div class="form-hint" style="margin-bottom: 0.75rem;">选择要在搜索栏中显示的搜索引擎</div>
      <div class="engines-grid">
        <label 
          v-for="engine in allEngines" 
          :key="engine.id"
          class="engine-checkbox"
        >
          <input 
            type="checkbox"
            :checked="enabledEngines.includes(engine.id)"
            @change="toggleEngine(engine.id)"
          />
          <span class="engine-label">
            <img 
              v-if="engine.icon.startsWith('http')" 
              :src="engine.icon" 
              class="engine-icon-img" 
              :alt="engine.name"
            />
            <span v-else class="engine-icon">{{ engine.icon }}</span>
            {{ engine.name }}
          </span>
        </label>
      </div>
    </div>
    
    <!-- 隐藏空分类 -->
    <div class="form-group">
      <label class="form-label">隐藏空分类</label>
      <div class="form-row">
        <span class="form-text">{{ hideEmptyCategories ? '已开启' : '已关闭' }}</span>
        <label class="switch">
          <input 
            type="checkbox" 
            :checked="hideEmptyCategories"
            @change="$emit('toggleHideEmpty')"
          >
          <span class="slider"></span>
        </label>
      </div>
      <div class="form-hint">不显示没有书签的分类</div>
    </div>

    <!-- 显示标签 -->
    <div class="form-group">
      <label class="form-label">显示标签</label>
      <div class="form-row">
        <span class="form-text">{{ showTags ? '已开启' : '已关闭' }}</span>
        <label class="switch">
          <input 
            type="checkbox" 
            :checked="showTags"
            @change="$emit('toggleShowTags')"
          >
          <span class="slider"></span>
        </label>
      </div>
      <div class="form-hint">关闭后书签卡片上不再显示标签（标签数据仍然保留）</div>
    </div>

    <!-- 公开模式 -->
    <div class="form-group">
      <label class="form-label">访问模式</label>
      <div class="form-row">
        <span class="form-text">{{ publicMode ? '公开模式' : '非公开模式' }}</span>
        <label class="switch">
          <input
            type="checkbox"
            :checked="publicMode"
            @change="$emit('togglePublicMode')"
          >
          <span class="slider"></span>
        </label>
      </div>
      <div class="form-hint">
        {{ publicMode ? '未登录用户可访问公开书签' : '未登录用户无法访问书签和分类' }}
      </div>
    </div>
    
    <!-- 随机壁纸 -->
    <div class="form-group">
      <label class="form-label">随机壁纸</label>
      <div class="form-row">
        <span class="form-text">{{ randomWallpaper ? '已开启' : '已关闭' }}</span>
        <label class="switch">
          <input 
            type="checkbox" 
            :checked="randomWallpaper"
            @change="$emit('toggleRandomWallpaper')"
          >
          <span class="slider"></span>
        </label>
      </div>
      <div class="form-hint">启用后会在页面背景显示随机壁纸</div>
    </div>
    
    <!-- 壁纸API接口 -->
    <div v-if="randomWallpaper" class="form-group">
      <label class="form-label">壁纸API接口</label>
      <div class="form-row">
        <input 
          type="text" 
          :value="wallpaperApi || '未设置'" 
          class="form-input" 
          readonly
        />
        <button type="button" class="text-btn" @click="openDialog">
          编辑
        </button>
      </div>
      <div class="form-hint">自定义随机壁纸API接口地址（留空则不显示壁纸）</div>
    </div>
    
    <!-- API接口编辑对话框 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showApiDialog" class="dialog-overlay" @click="showApiDialog = false">
          <div class="dialog-box api-dialog" @click.stop>
            <h3 class="dialog-title">编辑壁纸API接口</h3>
            
            <div class="form-group">
              <label>API接口地址 *</label>
              <input 
                v-model="apiInput" 
                type="text" 
                placeholder="请输入API接口地址，例如：https://api.example.com/wallpaper"
                @keyup.enter="handleConfirm"
                autofocus
              >
              <div class="form-hint">请输入返回图片URL的API接口地址</div>
            </div>
            
            <div class="form-group">
              <div class="example-apis">
                <div class="example-title">示例接口（点击快速填入）：</div>
                <button 
                  type="button"
                  class="example-btn" 
                  @click="apiInput = 'https://api.paugram.com/wallpaper/'"
                >
                  Paugram 壁纸 API
                </button>
                <button 
                  type="button"
                  class="example-btn" 
                  @click="apiInput = 'https://picsum.photos/1920/1080'"
                >
                  Lorem Picsum 随机图片
                </button>
              </div>
            </div>
            
            <p v-if="error" class="error-message">{{ error }}</p>
            
            <div class="dialog-buttons">
              <button class="text-btn" @click="handleCancel">取消</button>
              <button class="btn btn-primary" @click="handleConfirm">确认</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, nextTick, computed } from 'vue'
import { useSearchEngines } from '../../composables/useSearchEngines'

const props = defineProps({
  themeMode: String,
  themeStyle: {
    type: String,
    default: 'default'
  },
  isDark: Boolean,
  showSearch: Boolean,
  hideEmptyCategories: Boolean,
  publicMode: Boolean,
  customTitle: String,
  avatarUrl: String,
  username: {
    type: String,
    default: '用户'
  },
  footerContent: String,
  randomWallpaper: Boolean,
  wallpaperApi: String,
  displayMode: String,
  sortMode: {
    type: String,
    default: 'manual'
  },
  showTags: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits([
  'editTitle', 
  'editFooter', 
  'uploadAvatar',
  'setThemeMode', 
  'setThemeStyle',
  'toggleSearch', 
  'toggleHideEmpty', 
  'toggleShowTags',
  'togglePublicMode',
  'toggleRandomWallpaper',
  'updateWallpaperApi',
  'setDisplayMode'
])

const { SEARCH_ENGINES, enabledEngines, enabledSearchEnginesPanel, toggleEngine, toggleSearchEnginesPanel } = useSearchEngines()

const allEngines = computed(() => SEARCH_ENGINES)

const showApiDialog = ref(false)
const apiInput = ref('')
const error = ref('')
const avatarInput = ref(null)

const defaultAvatarIcon = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'

const handleUploadAvatar = () => {
  avatarInput.value?.click()
}

const handleAvatarChange = (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件')
    return
  }

  if (file.size > 2 * 1024 * 1024) {
    alert('图片大小不能超过 2MB')
    return
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    emit('uploadAvatar', e.target.result)
  }
  reader.readAsDataURL(file)
  
  event.target.value = ''
}

const handleThemeChange = (event) => {
  emit('setThemeMode', event.target.value)
}

const handleDisplayModeChange = (event) => {
  emit('setDisplayMode', event.target.value)
}

const handleSortModeChange = (event) => {
  emit('setSortMode', event.target.value)
}

const sortModeHint = computed(() => {
  const map = {
    manual: '按自定义顺序排列，可拖拽调整',
    clicks: '按点击次数从多到少，常用站点自动靠前',
    recent: '最新添加的书签排在最前',
    name: '按名称拼音字母顺序排列'
  }
  return map[props.sortMode] || '按自定义顺序排列'
})

const handleConfirm = () => {
  error.value = ''
  
  const trimmedUrl = apiInput.value.trim()
  
  // 如果为空，也允许（用于清除API）
  if (trimmedUrl === '') {
    emit('updateWallpaperApi', '')
    showApiDialog.value = false
    return
  }
  
  // 验证URL格式
  try {
    new URL(trimmedUrl)
    emit('updateWallpaperApi', trimmedUrl)
    showApiDialog.value = false
  } catch {
    error.value = '请输入有效的URL地址'
  }
}

const handleCancel = () => {
  apiInput.value = props.wallpaperApi || ''
  error.value = ''
  showApiDialog.value = false
}

// 打开对话框时初始化输入值
const openDialog = (e) => {
  if (e) {
    e.preventDefault()
    e.stopPropagation()
  }
  apiInput.value = props.wallpaperApi || ''
  error.value = ''
  showApiDialog.value = true
  // 确保对话框显示
  nextTick(() => {
    const dialog = document.querySelector('.api-dialog')
    if (dialog) {
      const input = dialog.querySelector('input')
      if (input) input.focus()
    }
  })
}
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
}

.form-label {
  display: block;
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 0.75rem;
}


.form-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.form-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font-size: 0.9375rem;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary);
}

.form-input:read-only {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: not-allowed;
}

.form-select {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font-size: 0.9375rem;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 0.5rem center;
  background-size: 1em;
  padding-right: 2rem;
}

.form-select:focus {
  outline: none;
  border-color: var(--primary);
}

.form-text {
  flex: 1;
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
}

.form-hint {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-top: 0.5rem;
}


.avatar-settings {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.avatar-preview {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-full);
  overflow: hidden;
  border: 2px solid var(--border);
  flex-shrink: 0;
}

.avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 1;
}

.avatar-btn {
  padding: 0.625rem 1.25rem;
  border-radius: var(--radius-sm);
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  transition: all 0.2s ease;
  width: 100%;
}

.avatar-btn svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.avatar-btn-upload {
  background: var(--primary);
  color: white;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

.avatar-btn-upload:hover {
  background: var(--primary-dark);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
  transform: translateY(-1px);
}

.avatar-btn-upload:active {
  transform: translateY(0);
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.3);
}

.footer-preview {
  flex: 1;
  padding: 0.5rem;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  font-size: 0.8125rem;
  color: var(--text-secondary);
  max-height: 60px;
  overflow: hidden;
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: var(--radius-sm);
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  transition: background-color 0.2s ease;
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-dark);
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text);
  border: 1px solid var(--border);
}

.btn-secondary:hover {
  background: var(--bg-hover);
  border-color: var(--primary);
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
}

.text-btn:hover {
  color: var(--primary);
}

.switch {
  position: relative;
  display: inline-block;
  width: 60px;
  height: 32px;
  flex-shrink: 0;
}
</style>

<!-- 对话框样式必须非 scoped，因为使用了 Teleport -->
<style>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.api-dialog {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: var(--radius);
  padding: 1.5rem;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  position: relative;
  z-index: 10001;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

html.dark .api-dialog {
  background: rgba(15, 23, 42, 0.85);
  border-color: rgba(255, 255, 255, 0.1);
}

.api-dialog .dialog-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 1.5rem;
}

.api-dialog .form-group {
  margin-bottom: 1.5rem;
}

.api-dialog .form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 0.5rem;
}

.api-dialog .form-group input {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font-size: 0.95rem;
  transition: var(--transition);
}

.api-dialog .form-group input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.api-dialog .form-hint {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-top: 0.5rem;
}

.api-dialog .dialog-buttons {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

.api-dialog .example-apis {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.api-dialog .example-title {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
}

.api-dialog .example-btn {
  padding: 0.5rem 0.75rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 0.875rem;
  cursor: pointer;
  transition: var(--transition);
  text-align: left;
}

.api-dialog .example-btn:hover {
  background: var(--bg-hover);
  border-color: var(--primary);
  color: var(--primary);
}

.api-dialog .error-message {
  color: var(--error);
  font-size: 0.875rem;
  margin-top: 0.5rem;
}

.api-dialog .text-btn {
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 0.9375rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: color 0.2s ease;
  font-weight: 500;
}

.api-dialog .text-btn:hover {
  color: var(--primary);
}

/* 淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--border);
  transition: var(--transition);
  border-radius: var(--radius-full);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.slider:before {
  position: absolute;
  content: "";
  height: 24px;
  width: 24px;
  left: 4px;
  bottom: 4px;
  background: white;
  transition: var(--transition);
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.switch input:checked + .slider {
  background: var(--primary);
  box-shadow: inset 0 2px 4px rgba(99, 102, 241, 0.3);
}

.switch input:checked + .slider:before {
  transform: translateX(28px);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

.switch:hover .slider {
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.15);
}

.switch:hover input:checked + .slider {
  box-shadow: inset 0 2px 4px rgba(99, 102, 241, 0.4);
}

.engines-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.engine-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--bg);
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: var(--transition);
  user-select: none;
}

.engine-checkbox:hover {
  border-color: var(--primary);
  background: var(--bg-hover);
}

.engine-checkbox input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--primary);
}

.engine-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  color: var(--text);
  font-weight: 500;
}

.engine-icon {
  font-size: 1.125rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.engine-icon-img {
  width: 18px;
  height: 18px;
  object-fit: contain;
  border-radius: 2px;
}
</style>
