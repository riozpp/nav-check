<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="dialog-overlay" @click="handleCancel">
        <div class="dialog-box prompt-dialog" @click.stop>
          <h3 class="dialog-title">{{ title }}</h3>
          <div class="form-group">
            <input 
              ref="inputRef"
              v-model="inputValue" 
              type="text" 
              :placeholder="placeholder"
              @keyup.enter="handleConfirm"
              @keyup.esc="handleCancel"
            >
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
const inputRef = ref(null)
let resolvePromise = null

const open = (ttl, defaultValue = '', placeholderText = '') => {
  title.value = ttl
  inputValue.value = defaultValue
  placeholder.value = placeholderText
  show.value = true
  
  nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
  
  return new Promise((resolve) => {
    resolvePromise = resolve
  })
}

const handleConfirm = () => {
  const value = inputValue.value.trim()
  show.value = false
  // 返回输入值（可能是空字符串），空字符串和 null 是不同的
  // null 表示取消，空字符串表示用户确认了但没有输入内容
  if (resolvePromise) resolvePromise(value === '' ? '' : value)
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
.prompt-dialog {
  max-width: 420px;
  padding: 1.5rem;
}

.prompt-dialog .dialog-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 1rem;
  text-align: center;
}

.prompt-dialog .form-group {
  margin-bottom: 1.5rem;
}

.prompt-dialog input {
  width: 100%;
  padding: 0.75rem 1rem;
  font-size: 1rem;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
  transition: var(--transition);
}

.prompt-dialog input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.prompt-dialog .dialog-buttons {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

.prompt-dialog .btn {
  padding: 0.75rem 1.5rem;
  font-size: 0.9rem;
  font-weight: 500;
  border-radius: var(--radius);
  transition: var(--transition);
}

.prompt-dialog .btn-primary {
  background: var(--primary);
  color: white;
  border: none;
}

.prompt-dialog .btn-primary:hover {
  background: var(--primary-dark);
  transform: translateY(-1px);
}

.prompt-dialog .btn-secondary {
  background: var(--bg-secondary);
  color: var(--text);
  border: 2px solid var(--border);
}

.prompt-dialog .btn-secondary:hover {
  background: var(--bg-hover);
  border-color: var(--text-secondary);
}
</style>

