import { ref } from 'vue'

let toastInstance = null

export function useToast() {
  const setToastInstance = (instance) => {
    toastInstance = instance
  }
  
  const success = (message, title = '', duration = 3000) => {
    if (toastInstance) {
      return toastInstance.success(message, title, duration)
    }
  }
  
  const error = (message, title = '', duration = 4000) => {
    if (toastInstance) {
      return toastInstance.error(message, title, duration)
    }
  }
  
  const warning = (message, title = '', duration = 3000) => {
    if (toastInstance) {
      return toastInstance.warning(message, title, duration)
    }
  }
  
  const info = (message, title = '', duration = 3000) => {
    if (toastInstance) {
      return toastInstance.info(message, title, duration)
    }
  }
  
  return {
    setToastInstance,
    success,
    error,
    warning,
    info
  }
}

