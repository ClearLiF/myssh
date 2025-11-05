<template>
  <teleport to="body">
    <div class="toast-container">
      <transition-group name="toast">
        <div 
          v-for="toast in toasts" 
          :key="toast.id" 
          class="toast-item"
          :class="[`toast-${toast.type}`, { 'toast-dismissible': toast.dismissible }]"
          @mouseenter="pauseTimer(toast)"
          @mouseleave="resumeTimer(toast)"
        >
          <div class="toast-icon">
            <el-icon :size="20">
              <SuccessFilled v-if="toast.type === 'success'" />
              <InfoFilled v-if="toast.type === 'info'" />
              <WarningFilled v-if="toast.type === 'warning'" />
              <CircleCloseFilled v-if="toast.type === 'error'" />
            </el-icon>
          </div>
          
          <div class="toast-content">
            <div v-if="toast.title" class="toast-title">{{ toast.title }}</div>
            <div class="toast-message">{{ toast.message }}</div>
          </div>

          <div class="toast-close" v-if="toast.dismissible" @click="removeToast(toast.id)">
            <el-icon :size="16"><Close /></el-icon>
          </div>
        </div>
      </transition-group>
    </div>
  </teleport>
</template>

<script setup>
import { ref } from 'vue'
import { SuccessFilled, InfoFilled, WarningFilled, CircleCloseFilled, Close } from '@element-plus/icons-vue'

const toasts = ref([])
let nextId = 1
const timers = new Map()

const addToast = (options) => {
  const toast = {
    id: nextId++,
    type: options.type || 'info',
    title: options.title || '',
    message: options.message || '',
    duration: options.duration !== undefined ? options.duration : 3000,
    dismissible: options.dismissible !== false
  }
  
  toasts.value.push(toast)
  
  // 自动关闭
  if (toast.duration > 0) {
    startTimer(toast)
  }
  
  return toast.id
}

const startTimer = (toast) => {
  const timer = setTimeout(() => {
    removeToast(toast.id)
  }, toast.duration)
  timers.set(toast.id, timer)
}

const pauseTimer = (toast) => {
  const timer = timers.get(toast.id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(toast.id)
  }
}

const resumeTimer = (toast) => {
  if (!timers.has(toast.id) && toast.duration > 0) {
    startTimer(toast)
  }
}

const removeToast = (id) => {
  const index = toasts.value.findIndex(t => t.id === id)
  if (index > -1) {
    const timer = timers.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.delete(id)
    }
    toasts.value.splice(index, 1)
  }
}

const clearAll = () => {
  timers.forEach(timer => clearTimeout(timer))
  timers.clear()
  toasts.value = []
}

// 暴露方法
defineExpose({
  success: (message, title, duration) => addToast({ type: 'success', message, title, duration }),
  info: (message, title, duration) => addToast({ type: 'info', message, title, duration }),
  warning: (message, title, duration) => addToast({ type: 'warning', message, title, duration }),
  error: (message, title, duration) => addToast({ type: 'error', message, title, duration }),
  addToast,
  removeToast,
  clearAll
})
</script>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: none;
}

.toast-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 300px;
  max-width: 400px;
  padding: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(10px);
  pointer-events: auto;
  cursor: default;
  transition: all 0.3s ease;
}

.toast-item:hover {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
  transform: translateY(-2px);
}

.toast-success {
  border-left: 4px solid #67c23a;
}

.toast-success .toast-icon {
  color: #67c23a;
}

.toast-info {
  border-left: 4px solid #409eff;
}

.toast-info .toast-icon {
  color: #409eff;
}

.toast-warning {
  border-left: 4px solid #e6a23c;
}

.toast-warning .toast-icon {
  color: #e6a23c;
}

.toast-error {
  border-left: 4px solid #f56c6c;
}

.toast-error .toast-icon {
  color: #f56c6c;
}

.toast-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--bg-secondary);
}

.toast-content {
  flex: 1;
  min-width: 0;
}

.toast-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.toast-message {
  font-size: 13px;
  color: var(--text-secondary);
  word-wrap: break-word;
  line-height: 1.5;
}

.toast-close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s ease;
}

.toast-close:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

/* 动画 */
.toast-enter-active {
  animation: toast-in 0.3s ease-out;
}

.toast-leave-active {
  animation: toast-out 0.3s ease-in;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes toast-out {
  from {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateX(100%) scale(0.8);
  }
}

/* 响应式 */
@media (max-width: 768px) {
  .toast-container {
    right: 10px;
    bottom: 10px;
    left: 10px;
  }

  .toast-item {
    min-width: 0;
    max-width: none;
  }
}
</style>




