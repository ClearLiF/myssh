<template>
  <div class="ssh-terminal-tab">
    <!-- 终端工具栏 -->
    <div class="terminal-toolbar">
      <div class="toolbar-left">
        <el-tag v-if="isConnected" type="success" size="small">
          <el-icon><SuccessFilled /></el-icon>
          已连接
        </el-tag>
        <el-tag v-else-if="connecting" type="warning" size="small">
          <el-icon><Loading /></el-icon>
          连接中...
        </el-tag>
        <el-tag v-else type="info" size="small">未连接</el-tag>
        
        <span v-if="isConnected" class="connection-info">
          {{ connection.username }}@{{ connection.host }}:{{ connection.port }}
        </span>
      </div>
      
      <div class="toolbar-right">
        <el-button
          v-if="!isConnected"
          type="primary"
          size="small"
          @click="connectSSH"
          :loading="connecting"
        >
          连接
        </el-button>
        <el-button
          v-else
          type="danger"
          size="small"
          @click="disconnectSSH"
        >
          断开
        </el-button>
        <el-button size="small" @click="clearTerminal" :disabled="!isConnected">
          清空
        </el-button>
      </div>
    </div>

    <!-- 终端区域 -->
    <div class="terminal-container" :class="{ 'connected': isConnected }">
      <div class="terminal-output" ref="terminalOutputRef" @click="focusInput">
        <div v-if="!isConnected && !connecting" class="terminal-welcome">
          <p>{{ isElectronMode ? '🚀 真实 SSH 模式' : '⚠️ 模拟模式' }}</p>
          <p>点击上方"连接"按钮建立 SSH 连接</p>
        </div>
        <div 
          v-for="(line, index) in terminalOutput" 
          :key="`line-${index}`" 
          class="terminal-line"
          :class="line.type"
        >
          <span v-if="line.type === 'command'" class="command-prefix">{{ line.prompt }}</span>
          <span v-html="formatOutput(line.content)"></span>
        </div>
      </div>
      
      <div class="terminal-input-line" v-if="isConnected">
        <span class="prompt">{{ currentPrompt }}</span>
        <input
          ref="commandInputRef"
          v-model="currentCommand"
          @keydown="handleKeydown"
          @keyup.enter="sendCommand"
          placeholder="输入命令..."
          class="command-input"
          :disabled="!isConnected || commandExecuting"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { SuccessFilled, Loading } from '@element-plus/icons-vue'

const props = defineProps({
  connection: {
    type: Object,
    required: true
  },
  tabMode: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['connected', 'disconnected'])

// 状态管理
const connecting = ref(false)
const isConnected = ref(false)
const commandExecuting = ref(false)

// 终端相关
const terminalOutput = ref([])
const currentCommand = ref('')
const currentPrompt = ref('$ ')
const commandHistory = ref([])
const historyIndex = ref(-1)

// DOM 引用
const terminalOutputRef = ref(null)
const commandInputRef = ref(null)

// SSH 连接 ID
const connectionId = ref(null)

// 检测是否在 Electron 环境中
const isElectronMode = computed(() => {
  return typeof window !== 'undefined' && !!window.electronAPI
})

// 添加终端行
const addTerminalLine = (line) => {
  terminalOutput.value.push(line)
  scrollToBottom()
}

// 清空终端
const clearTerminal = () => {
  terminalOutput.value = []
}

// 滚动到底部
const scrollToBottom = async () => {
  await nextTick()
  if (terminalOutputRef.value) {
    terminalOutputRef.value.scrollTop = terminalOutputRef.value.scrollHeight
  }
}

// 聚焦输入框
const focusInput = () => {
  if (commandInputRef.value && isConnected.value) {
    commandInputRef.value.focus()
  }
}

// 格式化输出
const formatOutput = (content) => {
  if (!content) return ''
  
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  
  return escaped.replace(/\n/g, '<br>')
}

// 连接 SSH
const connectSSH = async () => {
  connecting.value = true
  addTerminalLine({
    type: 'system',
    content: `正在连接到 ${props.connection.host}:${props.connection.port}...`,
    timestamp: new Date()
  })

  try {
    if (window.electronAPI) {
      const connectionConfig = {
        host: props.connection.host,
        port: props.connection.port,
        username: props.connection.username,
        authType: props.connection.authType,
        password: props.connection.password,
        privateKeyPath: props.connection.privateKeyPath
      }
      
      const result = await window.electronAPI.ssh.connect(connectionConfig)
      if (result.success) {
        connectionId.value = result.connectionId
        isConnected.value = true
        
        console.log('SSH 连接成功，connectionId:', connectionId.value)
        
        // 通知父组件连接成功
        emit('connected', connectionId.value)
        
        addTerminalLine({
          type: 'system',
          content: `✅ 已连接到 ${props.connection.host}`,
          timestamp: new Date()
        })
        addTerminalLine({
          type: 'system',
          content: `连接 ID: ${connectionId.value}`,
          timestamp: new Date()
        })
        
        currentPrompt.value = `${props.connection.username}@${props.connection.host}:~$ `
        
        ElMessage.success('SSH 连接成功！')
        
        await nextTick()
        focusInput()
      } else {
        throw new Error(result.message)
      }
    } else {
      // 模拟连接
      await new Promise(resolve => setTimeout(resolve, 1000))
      isConnected.value = true
      currentPrompt.value = `${props.connection.username}@${props.connection.host}:~$ `
      
      addTerminalLine({
        type: 'system',
        content: `🔧 模拟连接到 ${props.connection.host}`,
        timestamp: new Date()
      })
      
      ElMessage.success('SSH 连接成功！（模拟模式）')
      await nextTick()
      focusInput()
    }
  } catch (error) {
    addTerminalLine({
      type: 'error',
      content: `❌ 连接失败: ${error.message}`,
      timestamp: new Date()
    })
    ElMessage.error(`SSH 连接失败: ${error.message}`)
  } finally {
    connecting.value = false
  }
}

// 断开 SSH 连接
const disconnectSSH = async () => {
  try {
    if (window.electronAPI && connectionId.value) {
      await window.electronAPI.ssh.disconnect(connectionId.value)
    }
    
    isConnected.value = false
    connectionId.value = null
    currentPrompt.value = '$ '
    
    addTerminalLine({
      type: 'system',
      content: '❌ 连接已断开',
      timestamp: new Date()
    })
    
    ElMessage.info('SSH 连接已断开')
  } catch (error) {
    ElMessage.error('断开连接时发生错误')
  }
}

// 发送命令
const sendCommand = async () => {
  const command = currentCommand.value.trim()
  if (!command || !isConnected.value || commandExecuting.value) return
  
  if (command !== commandHistory.value[commandHistory.value.length - 1]) {
    commandHistory.value.push(command)
    if (commandHistory.value.length > 100) {
      commandHistory.value.shift()
    }
  }
  historyIndex.value = commandHistory.value.length
  
  addTerminalLine({
    type: 'command',
    prompt: currentPrompt.value,
    content: command,
    timestamp: new Date()
  })
  
  currentCommand.value = ''
  commandExecuting.value = true
  
  try {
    if (window.electronAPI && connectionId.value) {
      const result = await window.electronAPI.ssh.execute(String(connectionId.value), String(command))
      
      if (result.success) {
        if (result.currentDir) {
          currentPrompt.value = `${props.connection.username}@${props.connection.host}:${result.currentDir}$ `
        }
        
        if (result.stdout) {
          addTerminalLine({
            type: 'output',
            content: result.stdout,
            timestamp: new Date()
          })
        }
        if (result.stderr) {
          addTerminalLine({
            type: 'error',
            content: result.stderr,
            timestamp: new Date()
          })
        }
      } else {
        addTerminalLine({
          type: 'error',
          content: result.message || '命令执行失败',
          timestamp: new Date()
        })
      }
    } else {
      // 模拟命令执行
      await new Promise(resolve => setTimeout(resolve, 300))
      let output = ''
      if (command === 'ls') {
        output = 'file1.txt  file2.txt  folder1/'
      } else if (command === 'pwd') {
        output = '/home/user'
      } else {
        output = `模拟执行: ${command}`
      }
      
      addTerminalLine({
        type: 'output',
        content: output,
        timestamp: new Date()
      })
    }
  } catch (error) {
    addTerminalLine({
      type: 'error',
      content: `错误: ${error.message}`,
      timestamp: new Date()
    })
  } finally {
    commandExecuting.value = false
    scrollToBottom()
    await nextTick()
    focusInput()
  }
}

// 处理键盘事件
const handleKeydown = (event) => {
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (historyIndex.value > 0) {
      historyIndex.value--
      currentCommand.value = commandHistory.value[historyIndex.value]
    }
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (historyIndex.value < commandHistory.value.length - 1) {
      historyIndex.value++
      currentCommand.value = commandHistory.value[historyIndex.value]
    } else {
      historyIndex.value = commandHistory.value.length
      currentCommand.value = ''
    }
  }
}

// 组件挂载时自动连接
onMounted(() => {
  addTerminalLine({
    type: 'system',
    content: '🚀 终端已启动',
    timestamp: new Date()
  })
  
  // 自动连接
  if (props.tabMode) {
    setTimeout(() => {
      connectSSH()
    }, 500)
  }
})

onUnmounted(() => {
  if (isConnected.value) {
    disconnectSSH()
  }
})

// 暴露方法给父组件
defineExpose({
  connectSSH,
  disconnectSSH,
  connectionId
})
</script>

<style scoped>
.ssh-terminal-tab {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0d1117;
  position: relative;
}

.ssh-terminal-tab::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(102, 126, 234, 0.3), transparent);
}

.terminal-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: linear-gradient(135deg, rgba(13, 17, 23, 0.95) 0%, rgba(22, 27, 34, 0.95) 100%);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(48, 54, 61, 0.5);
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.connection-info {
  font-size: 12px;
  color: #858585;
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

.terminal-container {
  flex: 1;
  background: #0d1117;
  color: #e6edf3;
  font-family: 'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', monospace;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.7;
  letter-spacing: 0.1px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 20px 24px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

.terminal-container.connected {
  border-left: 2px solid rgba(103, 194, 58, 0.4);
  background: linear-gradient(135deg, rgba(103, 194, 58, 0.02) 0%, rgba(13, 17, 23, 1) 100%);
}

.terminal-output {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 12px;
}

.terminal-output::-webkit-scrollbar {
  width: 8px;
}

.terminal-output::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.terminal-output::-webkit-scrollbar-thumb {
  background: #424242;
  border-radius: 4px;
}

.terminal-welcome {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.terminal-welcome p {
  margin: 8px 0;
}

.terminal-line {
  margin-bottom: 6px;
  word-wrap: break-word;
  white-space: pre-wrap;
  animation: fadeIn 0.2s ease-in;
}

.terminal-line.command {
  color: #e6edf3;
  font-weight: 500;
  text-shadow: 0 0 1px rgba(230, 237, 243, 0.5);
}

.terminal-line.output {
  color: #c9d1d9;
  opacity: 0.95;
}

.terminal-line.error {
  color: #ff7b72;
  background: rgba(255, 123, 114, 0.05);
  padding: 2px 8px;
  border-radius: 4px;
  border-left: 3px solid rgba(255, 123, 114, 0.3);
  margin-left: -8px;
}

.terminal-line.system {
  color: #79c0ff;
  background: rgba(121, 192, 255, 0.05);
  padding: 2px 8px;
  border-radius: 4px;
  border-left: 3px solid rgba(121, 192, 255, 0.3);
  margin-left: -8px;
}

.command-prefix {
  color: #7ee787;
  font-weight: 600;
  margin-right: 6px;
  text-shadow: 0 0 2px rgba(126, 231, 135, 0.3);
}

.terminal-input-line {
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: 1px solid rgba(48, 54, 61, 0.5);
  padding-top: 16px;
  flex-shrink: 0;
  background: rgba(13, 17, 23, 0.5);
  margin: 0 -24px -20px -24px;
  padding-left: 24px;
  padding-right: 24px;
  padding-bottom: 20px;
}

.prompt {
  color: #7ee787;
  font-weight: 600;
  white-space: nowrap;
  text-shadow: 0 0 2px rgba(126, 231, 135, 0.3);
  font-size: 13.5px;
}

.command-input {
  flex: 1;
  background: rgba(48, 54, 61, 0.3);
  border: 1px solid rgba(48, 54, 61, 0.5);
  border-radius: 6px;
  color: #e6edf3;
  font-family: inherit;
  font-size: inherit;
  outline: none;
  padding: 8px 12px;
  transition: all 0.3s;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.command-input:focus {
  background: rgba(48, 54, 61, 0.5);
  border-color: rgba(126, 231, 135, 0.4);
  box-shadow: 0 0 0 2px rgba(126, 231, 135, 0.1);
}

.command-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: rgba(48, 54, 61, 0.2);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>

