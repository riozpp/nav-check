<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="dialog-overlay" @click="handleCancel">
        <div class="dialog-box" @click.stop>
          <h3 class="dialog-title">{{ title }}</h3>
          <p class="dialog-message">{{ message }}</p>
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
import { ref } from 'vue'

const show = ref(false)
const title = ref('')
const message = ref('')
let resolvePromise = null

const open = (msg, ttl = '确认操作') => {
  title.value = ttl
  message.value = msg
  show.value = true
  
  return new Promise((resolve) => {
    resolvePromise = resolve
  })
}

const handleConfirm = () => {
  show.value = false
  if (resolvePromise) resolvePromise(true)
}

const handleCancel = () => {
  show.value = false
  if (resolvePromise) resolvePromise(false)
}

defineExpose({
  open
})
</script>

