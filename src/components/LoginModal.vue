<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="dialog-overlay" @click="close">
        <div class="dialog-box login-modal" @click.stop>
          <h3 class="dialog-title">登录</h3>
          <div class="form-group">
            <label>用户名</label>
            <input 
              v-model="username" 
              type="text" 
              placeholder="请输入用户名"
              @keyup.enter="handleLogin"
            >
          </div>
          <div class="form-group">
            <label>密码</label>
            <input 
              v-model="password" 
              type="password" 
              placeholder="请输入密码"
              @keyup.enter="handleLogin"
            >
          </div>
          <div class="form-group">
            <label class="remember-me-label">
              <input v-model="rememberMe" type="checkbox">
              <span>记住我（一个月内免登录）</span>
            </label>
          </div>
          <p v-if="error" class="error-message">{{ error }}</p>
          <div class="dialog-buttons">
            <button class="btn btn-secondary" @click="close">取消</button>
            <button class="btn btn-primary" @click="handleLogin">登录</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { useAuth } from '../composables/useAuth'

const { login } = useAuth()

const show = ref(false)
const username = ref('')
const password = ref('')
const rememberMe = ref(false)
const error = ref('')

const open = () => {
  show.value = true
  username.value = ''
  password.value = ''
  rememberMe.value = false
  error.value = ''
}

const close = () => {
  show.value = false
}

const handleLogin = async () => {
  if (!username.value || !password.value) {
    error.value = '请输入用户名和密码'
    return
  }
  
  const result = await login(username.value, password.value, rememberMe.value)
  
  if (result.success) {
    close()
  } else {
    error.value = result.error || '登录失败'
  }
}

defineExpose({
  open,
  close
})
</script>

<style scoped>
.remember-me-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0;
  margin: 0;
}

.remember-me-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--primary);
}

.remember-me-label span {
  font-size: 0.95rem;
  color: var(--text);
  font-weight: 500;
  user-select: none;
}

.remember-me-label:hover span {
  color: var(--primary);
}
</style>

