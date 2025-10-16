<template>
  <div class="connection-tab">
    <el-container class="tab-container">
      <!-- 上半部分: SSH 终端 -->
      <el-main class="terminal-section" :style="{ height: terminalHeight + '%' }">
        <SSHTerminal 
          :connection="connection" 
          :tab-mode="true"
          ref="sshTerminalRef"
          @connected="handleConnected"
        />
      </el-main>

      <!-- 分隔条 -->
      <div 
        class="resize-handle"
        @mousedown="startResize"
      >
        <div class="resize-line"></div>
      </div>

      <!-- 下半部分: SFTP 文件管理 -->
      <el-main class="sftp-section" :style="{ height: sftpHeight + '%' }">
        <SFTPManager 
          :connection="connection"
          :connection-id="connectionId"
          :tab-mode="true"
        />
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import SSHTerminal from './SSHTerminalTab.vue'
import SFTPManager from './SFTPManagerTab.vue'

const props = defineProps({
  connection: {
    type: Object,
    required: true
  },
  tabId: {
    type: String,
    required: true
  }
})

const sshTerminalRef = ref(null)
const connectionId = ref(null)
const terminalHeight = ref(60)
const sftpHeight = ref(40)
const isResizing = ref(false)
const startY = ref(0)
const startTerminalHeight = ref(60)

// 监听SSH终端的连接状态，获取connectionId
watch(() => sshTerminalRef.value, (terminal) => {
  if (terminal && terminal.connectionId) {
    connectionId.value = terminal.connectionId.value
  }
}, { deep: true, immediate: true })

// 定期检查 connectionId
const checkConnectionId = setInterval(() => {
  if (sshTerminalRef.value && sshTerminalRef.value.connectionId) {
    const newId = sshTerminalRef.value.connectionId.value
    if (newId && newId !== connectionId.value) {
      connectionId.value = newId
      console.log('ConnectionTab 获取到 connectionId:', newId)
    }
  }
}, 1000)

// 开始调整大小
const startResize = (event) => {
  isResizing.value = true
  startY.value = event.clientY
  startTerminalHeight.value = terminalHeight.value
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  event.preventDefault()
}

// 调整大小
const handleResize = (event) => {
  if (!isResizing.value) return
  
  const container = event.target.closest('.connection-tab')
  if (!container) return
  
  const containerHeight = container.offsetHeight
  const deltaY = event.clientY - startY.value
  const deltaPercent = (deltaY / containerHeight) * 100
  
  let newTerminalHeight = startTerminalHeight.value + deltaPercent
  
  // 限制最小和最大高度
  newTerminalHeight = Math.max(20, Math.min(80, newTerminalHeight))
  
  terminalHeight.value = newTerminalHeight
  sftpHeight.value = 100 - newTerminalHeight
}

// 停止调整大小
const stopResize = () => {
  isResizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
}

// 处理 SSH 连接成功事件
const handleConnected = (id) => {
  connectionId.value = id
  console.log('ConnectionTab 收到连接成功事件，connectionId:', id)
}

onMounted(() => {
  // 可以在这里自动连接
})

onUnmounted(() => {
  // 清理
  if (isResizing.value) {
    stopResize()
  }
  // 清除定时器
  if (checkConnectionId) {
    clearInterval(checkConnectionId)
  }
})
</script>

<style scoped>
.connection-tab {
  height: 100%;
  width: 100%;
  background: linear-gradient(180deg, #0d1117 0%, #161b22 100%);
  overflow: hidden;
}

.tab-container {
  height: 100%;
  flex-direction: column;
  overflow: hidden;
}

.terminal-section {
  padding: 0;
  overflow: hidden;
  background: #0d1117;
  border-bottom: 1px solid rgba(48, 54, 61, 0.5);
}

.resize-handle {
  height: 8px;
  background: linear-gradient(180deg, rgba(13, 17, 23, 0.8) 0%, rgba(22, 27, 34, 0.8) 100%);
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 10;
  user-select: none;
  transition: all 0.2s;
  border-top: 1px solid rgba(48, 54, 61, 0.3);
  border-bottom: 1px solid rgba(48, 54, 61, 0.3);
}

.resize-handle:hover {
  background: linear-gradient(180deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%);
  border-color: rgba(102, 126, 234, 0.3);
}

.resize-handle:hover .resize-line {
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  width: 60px;
  height: 3px;
}

.resize-line {
  width: 50px;
  height: 2px;
  background: rgba(139, 148, 158, 0.3);
  border-radius: 2px;
  transition: all 0.2s;
}

.sftp-section {
  padding: 0;
  overflow: hidden;
  background: linear-gradient(180deg, #161b22 0%, #1a1f26 100%);
}
</style>

