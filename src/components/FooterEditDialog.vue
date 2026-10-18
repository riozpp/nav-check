<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="dialog-overlay" @click="handleCancel">
        <div class="dialog-box footer-edit-dialog" @click.stop>
          <h3 class="dialog-title">{{ title }}</h3>
          <div class="form-group">
            <label class="form-label">页脚内容（支持HTML）</label>
            <textarea 
              ref="textareaRef"
              v-model="inputValue" 
              :placeholder="placeholder"
              @keydown.ctrl.enter="handleConfirm"
              @keydown.esc="handleCancel"
              rows="8"
            ></textarea>
            <div class="form-hint">
              支持HTML标签，如：&lt;p&gt;、&lt;a&gt;、&lt;strong&gt; 等
            </div>
          </div>
          <div class="dialog-buttons">
            <button class="btn btn-secondary" @click="handleCancel">取消</button>
            <button class="btn btn-primary" @click="handleConfirm">确定</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, nextTick } from 'vue'

const show = ref(false)
const title = ref('')
const placeholder = ref('')
const inputValue = ref('')
const textareaRef = ref(null)
let resolvePromise = null

const open = (ttl, defaultValue = '', placeholderText = '') => {
  title.value = ttl
  inputValue.value = defaultValue
  placeholder.value = placeholderText
  show.value = true
  
  nextTick(() => {
    textareaRef.value?.focus()
    textareaRef.value?.select()
  })
  
  return new Promise((resolve) => {
    resolvePromise = resolve
  })
}

const handleConfirm = () => {
  const value = inputValue.value.trim()
  show.value = false
  if (resolvePromise) resolvePromise(value || null)
}

const handleCancel = () => {
  show.value = false
  if (resolvePromise) resolvePromise(null)
}

defineExpose({
  open
})
</script>

<style scoped>
.footer-edit-dialog {
  max-width: 600px;
  padding: 2rem;
}

.footer-edit-dialog .dialog-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 1.5rem;
  text-align: center;
}

.footer-edit-dialog .form-group {
  margin-bottom: 2rem;
}

.footer-edit-dialog .form-label {
  display: block;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 0.75rem;
}

.footer-edit-dialog textarea {
  width: 100%;
  min-height: 200px;
  padding: 1rem;
  font-size: 0.9rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
  transition: var(--transition);
  resize: vertical;
  line-height: 1.5;
}

.footer-edit-dialog textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.footer-edit-dialog .form-hint {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-top: 0.5rem;
  line-height: 1.4;
}

.footer-edit-dialog .dialog-buttons {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

.footer-edit-dialog .btn {
  padding: 0.75rem 1.5rem;
  font-size: 0.9rem;
  font-weight: 500;
  border-radius: var(--radius);
  transition: var(--transition);
}

.footer-edit-dialog .btn-primary {
  background: var(--primary);
  color: white;
  border: none;
}

.footer-edit-dialog .btn-primary:hover {
  background: var(--primary-dark);
  transform: translateY(-1px);
}

.footer-edit-dialog .btn-secondary {
  background: var(--bg-secondary);
  color: var(--text);
  border: 2px solid var(--border);
}

.footer-edit-dialog .btn-secondary:hover {
  background: var(--bg-hover);
  border-color: var(--text-secondary);
}

/* Mobile optimization */
@media (max-width: 768px) {
  .footer-edit-dialog {
    max-width: 95%;
    padding: 1.5rem;
  }
  
  .footer-edit-dialog textarea {
    min-height: 150px;
    font-size: 0.85rem;
  }
}
</style>
