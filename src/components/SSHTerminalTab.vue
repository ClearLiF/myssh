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
        <el-switch
          v-model="usePtyMode"
          inline-prompt
          style="--el-switch-on-color: #FF79C6; --el-switch-off-color: #6272A4; margin-right: 12px; --el-switch-border-color: rgba(139, 233, 253, 0.2);"
          active-text="PTY"
          inactive-text="简单"
          :disabled="isConnected"
        />
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

    <!-- PTY 终端区域 (xterm.js) -->
    <div v-if="usePtyMode" class="xterm-container" ref="xtermContainer"></div>

    <!-- 简单终端区域 -->
    <div 
      v-else
      class="terminal-wrapper"
      @click="handleContainerClick"
      @keydown="handleContainerKeydown"
      tabindex="0"
      ref="terminalContainerRef"
    >
      <div 
        class="terminal-container" 
        :class="{ 'connected': isConnected }"
      >
        <div class="terminal-output" ref="terminalOutputRef">
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
      </div>
      
      <!-- 流式命令提示 - 固定在底部 -->
      <div v-if="isConnected && isStreamingCommand" class="streaming-indicator">
        <span class="streaming-text">
          <span class="streaming-dot"></span>
          正在实时输出... (按 Ctrl+C 或 ⌘+C 中断)
        </span>
      </div>
      
      <!-- 固定在底部的命令输入行 -->
      <div class="terminal-input-area" v-if="isConnected && !isStreamingCommand">
        <div class="terminal-input-line">
          <span class="prompt">{{ currentPrompt }}</span>
          <input
            ref="commandInputRef"
            v-model="currentCommand"
            @keydown="handleKeydown"
            class="command-input"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { SuccessFilled, Loading } from '@element-plus/icons-vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import 'xterm/css/xterm.css'

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
const isStreamingCommand = ref(false)
const usePtyMode = ref(true) // 默认使用 PTY 模式

// PTY 相关
const xtermContainer = ref(null)
let terminal = null
let fitAddon = null

// 终端相关
const terminalOutput = ref([])
const currentCommand = ref('')
const currentPrompt = ref('$ ')
const commandHistory = ref([])
const historyIndex = ref(-1)

// DOM 引用
const terminalOutputRef = ref(null)
const commandInputRef = ref(null)
const terminalContainerRef = ref(null)

// SSH 连接 ID
const connectionId = ref(null)

// 流式数据缓冲区（累积不完整的行）
const streamBuffer = ref('')

// 检测是否在 Electron 环境中
const isElectronMode = computed(() => {
  return typeof window !== 'undefined' && !!window.electronAPI
})

// 添加终端行
const addTerminalLine = (line) => {
  terminalOutput.value.push(line)
  nextTick(() => {
    scrollToBottom()
  })
}

// 清空终端
const clearTerminal = () => {
  if (usePtyMode.value && terminal) {
    terminal.clear()
  } else {
    terminalOutput.value = []
  }
}

// 滚动到底部
const scrollToBottom = async () => {
  await nextTick()
  if (terminalOutputRef.value) {
    terminalOutputRef.value.scrollTop = terminalOutputRef.value.scrollHeight
  }
}

// 处理终端容器点击事件
const handleContainerClick = () => {
  // 检查是否有文字被选中
  const selection = window.getSelection()
  if (selection && selection.toString().length > 0) {
    // 如果有选中的文字，不执行聚焦操作，让用户可以复制
    return
  }
  
  // 没有选中文字时，正常聚焦
  focusInput()
}

// 聚焦输入框或终端容器
const focusInput = () => {
  nextTick(() => {
    if (isStreamingCommand.value) {
      // 流式命令时，聚焦到容器以接收键盘事件
      if (terminalContainerRef.value) {
        terminalContainerRef.value.focus()
      }
    } else if (commandInputRef.value && isConnected.value) {
      // 正常状态，聚焦到输入框
      commandInputRef.value.focus()
    }
  })
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
        
        // 根据模式初始化终端
        if (usePtyMode.value) {
          await initializePty()
        } else {
          await nextTick()
          focusInput()
        }
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

// 初始化 PTY 终端
const initializePty = async () => {
  if (!window.electronAPI || !connectionId.value || !xtermContainer.value) {
    return
  }

  try {
    // 创建 xterm 实例 - Dracula Pro 主题
    terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      cursorWidth: 2,
      fontSize: 15,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, "Courier New", monospace',
      fontWeight: '400',
      fontWeightBold: '700',
      lineHeight: 1.2,
      letterSpacing: 0,
      theme: {
        // Dracula Pro 配色
        background: '#22212C',
        foreground: '#F8F8F2',
        cursor: '#FF79C6',
        cursorAccent: '#22212C',
        selection: 'rgba(139, 233, 253, 0.3)',
        black: '#22212C',
        red: '#FF6E6E',
        green: '#69FF94',
        yellow: '#FFFFA5',
        blue: '#D6ACFF',
        magenta: '#FF92DF',
        cyan: '#A4FFFF',
        white: '#F8F8F2',
        brightBlack: '#6272A4',
        brightRed: '#FF6E6E',
        brightGreen: '#69FF94',
        brightYellow: '#FFFFA5',
        brightBlue: '#D6ACFF',
        brightMagenta: '#FF92DF',
        brightCyan: '#A4FFFF',
        brightWhite: '#FFFFFF'
      },
      allowTransparency: true,
      scrollback: 10000,
      tabStopWidth: 8,
      smoothScrollDuration: 100,
      fastScrollModifier: 'shift',
      fastScrollSensitivity: 5,
      windowsMode: false,
      macOptionIsMeta: true
    })

    // 添加插件
    fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())

    // 挂载到 DOM
    terminal.open(xtermContainer.value)
    fitAddon.fit()

    // 监听窗口大小变化
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddon && terminal) {
        fitAddon.fit()
        // 通知后端调整 PTY 大小
        if (window.electronAPI && connectionId.value) {
          window.electronAPI.ssh.ptyResize(
            connectionId.value,
            terminal.cols,
            terminal.rows
          )
        }
      }
    })
    resizeObserver.observe(xtermContainer.value)

    // 监听用户输入
    terminal.onData((data) => {
      if (window.electronAPI && connectionId.value) {
        window.electronAPI.ssh.ptyWrite(connectionId.value, data)
      }
    })

    // 创建 PTY shell
    const result = await window.electronAPI.ssh.createPty(
      connectionId.value,
      terminal.cols,
      terminal.rows
    )

    if (result.success) {
      // 监听 PTY 输出
      window.electronAPI.ssh.onPtyData((data) => {
        if (data.connectionId === connectionId.value && terminal) {
          terminal.write(data.data)
        }
      })

      // 监听 PTY 关闭
      window.electronAPI.ssh.onPtyClose((data) => {
        if (data.connectionId === connectionId.value) {
          ElMessage.warning('PTY shell 已关闭')
          disconnectSSH()
        }
      })

      ElMessage.success('PTY 终端已启动，支持 vim 等交互式命令！')
    } else {
      throw new Error(result.message)
    }
  } catch (error) {
    console.error('初始化 PTY 失败:', error)
    ElMessage.error(`PTY 初始化失败: ${error.message}`)
  }
}

// 断开 SSH 连接
const disconnectSSH = async () => {
  try {
    // 清理 PTY 资源
    if (usePtyMode.value) {
      if (terminal) {
        terminal.dispose()
        terminal = null
      }
      fitAddon = null
      
      if (window.electronAPI) {
        window.electronAPI.ssh.removePtyDataListener()
        window.electronAPI.ssh.removePtyCloseListener()
      }
    }
    
    if (window.electronAPI && connectionId.value) {
      await window.electronAPI.ssh.disconnect(connectionId.value)
    }
    
    isConnected.value = false
    connectionId.value = null
    currentPrompt.value = '$ '
    
    if (!usePtyMode.value) {
      addTerminalLine({
        type: 'system',
        content: '❌ 连接已断开',
        timestamp: new Date()
      })
    }
    
    ElMessage.info('SSH 连接已断开')
  } catch (error) {
    ElMessage.error('断开连接时发生错误')
  }
}

// 发送命令
const sendCommand = async () => {
  const command = currentCommand.value.trim()
  
  // 如果未连接或正在执行命令，直接返回
  if (!isConnected.value || commandExecuting.value) return
  
  // 如果是空命令，只添加一个空行
  if (!command) {
    addTerminalLine({
      type: 'command',
      prompt: currentPrompt.value,
      content: '',
      timestamp: new Date()
    })
    currentCommand.value = ''
    await nextTick()
    await nextTick()
    scrollToBottom()
    focusInput()
    return
  }
  
  // 检查是否是交互式命令（需要 PTY 支持）
  const interactiveCommands = ['vim', 'vi', 'nano', 'emacs', 'top', 'htop', 'less', 'more', 'man']
  const cmdName = command.split(/\s+/)[0]
  if (interactiveCommands.includes(cmdName)) {
    // 添加命令行
    addTerminalLine({
      type: 'command',
      prompt: currentPrompt.value,
      content: command,
      timestamp: new Date()
    })
    // 添加错误提示
    addTerminalLine({
      type: 'error',
      content: `抱歉，当前终端不支持交互式命令 '${cmdName}'`,
      timestamp: new Date()
    })
    addTerminalLine({
      type: 'system',
      content: '提示: 请使用文件管理器编辑文件，或使用 cat、echo 等非交互式命令',
      timestamp: new Date()
    })
    currentCommand.value = ''
    await nextTick()
    await nextTick()
    scrollToBottom()
    focusInput()
    return
  }
  
  // 检查是否是流式命令（提前判断）
  const isStreaming = command.includes(' -f') || 
                      command.includes('tail -f') || 
                      command.includes('docker logs')
  
  // 如果是流式命令，立即标记状态并聚焦容器
  if (isStreaming) {
    isStreamingCommand.value = true
    streamBuffer.value = '' // 清空流式数据缓冲区
    await nextTick()
    if (terminalContainerRef.value) {
      terminalContainerRef.value.focus()
    }
  }
  
  // 标记正在执行
  commandExecuting.value = true
  
  // 先将命令添加到历史
  if (command !== commandHistory.value[commandHistory.value.length - 1]) {
    commandHistory.value.push(command)
    if (commandHistory.value.length > 100) {
      commandHistory.value.shift()
    }
  }
  historyIndex.value = commandHistory.value.length
  
  // 将命令行添加到输出历史
  addTerminalLine({
    type: 'command',
    prompt: currentPrompt.value,
    content: command,
    timestamp: new Date()
  })
  
  // 立即清空输入框
  currentCommand.value = ''
  
  // 等待 DOM 更新后滚动
  await nextTick()
  await nextTick()
  scrollToBottom()
  
  try {
    if (window.electronAPI && connectionId.value) {
      const result = await window.electronAPI.ssh.execute(String(connectionId.value), String(command))
      
      if (result.success) {
        // 更新当前目录
        if (result.currentDir) {
          currentPrompt.value = `${props.connection.username}@${props.connection.host}:${result.currentDir}$ `
        }
        
        // 如果是流式命令，数据会通过 onStreamData 回调实时接收
        if (result.streaming) {
          // 不要立即解除 commandExecuting，等待 stream-end 事件
          return
        }
        
        // 显示标准输出
        if (result.stdout) {
          addTerminalLine({
            type: 'output',
            content: result.stdout,
            timestamp: new Date()
          })
        }
        // 显示错误输出
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
      } else if (command === 'clear') {
        clearTerminal()
        commandExecuting.value = false
        isStreamingCommand.value = false
        focusInput()
        return
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
    // 非流式命令执行完毕，清除状态
    if (!isStreamingCommand.value) {
      commandExecuting.value = false
      await nextTick()
      scrollToBottom()
      focusInput()
    }
  }
}

// 处理容器级别的键盘事件（用于中断流式命令）
const handleContainerKeydown = (event) => {
  // 处理 Ctrl+C 或 Cmd+C 中断流式命令
  if ((event.ctrlKey || event.metaKey) && event.key === 'c' && isStreamingCommand.value) {
    event.preventDefault()
    event.stopPropagation()
    interruptStreaming()
    return
  }
  
  // 如果不是流式命令状态，让输入框处理其他键盘事件
  if (!isStreamingCommand.value && commandInputRef.value) {
    commandInputRef.value.focus()
  }
}

// 中断流式命令
const interruptStreaming = async () => {
  if (!isStreamingCommand.value) return
  
  addTerminalLine({
    type: 'system',
    content: '^C',
    timestamp: new Date()
  })
  
  // 通知后端中断
  if (window.electronAPI && connectionId.value) {
    try {
      await window.electronAPI.ssh.interrupt(connectionId.value)
    } catch (error) {
      console.error('中断命令失败:', error)
    }
  }
  
  // 重置状态
  isStreamingCommand.value = false
  commandExecuting.value = false
  currentCommand.value = ''
  streamBuffer.value = '' // 清空流式数据缓冲区
  
  await nextTick()
  focusInput()
}

// 处理输入框键盘事件
const handleKeydown = (event) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    sendCommand()
  } else if (event.key === 'ArrowUp') {
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
  } else if (event.key === 'Tab') {
    event.preventDefault()
    // 简单的命令补全
    const commonCommands = ['ls', 'cd', 'pwd', 'cat', 'grep', 'find', 'ps', 'top', 'df', 'free', 'vim', 'nano', 'clear']
    const currentCmd = currentCommand.value.trim()
    if (currentCmd) {
      const matches = commonCommands.filter(cmd => cmd.startsWith(currentCmd))
      if (matches.length === 1) {
        currentCommand.value = matches[0] + ' '
      } else if (matches.length > 1) {
        // 显示所有匹配项
        addTerminalLine({
          type: 'system',
          content: matches.join('  '),
          timestamp: new Date()
        })
      }
    }
  } else if (event.key === 'l' && (event.ctrlKey || event.metaKey)) {
    // Ctrl+L 清屏
    event.preventDefault()
    clearTerminal()
  }
}

// 处理实时流式数据
const handleStreamData = (data) => {
  if (data.connectionId !== connectionId.value) return
  
  const lineType = data.type === 'stdout' ? 'output' : 'error'
  
  // 将新数据添加到缓冲区
  streamBuffer.value += data.data
  
  // 按行分割数据
  const lines = streamBuffer.value.split('\n')
  
  // 最后一个元素可能是不完整的行，保留在缓冲区
  streamBuffer.value = lines.pop() || ''
  
  // 添加完整的行到终端
  lines.forEach(line => {
    if (line || line === '') { // 保留空行
      addTerminalLine({
        type: lineType,
        content: line,
        timestamp: new Date()
      })
    }
  })
}

// 处理流式结束
const handleStreamEnd = (data) => {
  if (data.connectionId !== connectionId.value) return
  
  // 如果缓冲区还有剩余数据，添加到终端
  if (streamBuffer.value) {
    addTerminalLine({
      type: 'output',
      content: streamBuffer.value,
      timestamp: new Date()
    })
    streamBuffer.value = ''
  }
  
  isStreamingCommand.value = false
  commandExecuting.value = false
  focusInput()
}

// 组件挂载时自动连接
onMounted(() => {
  addTerminalLine({
    type: 'system',
    content: '🚀 终端已启动',
    timestamp: new Date()
  })
  
  // 监听实时流式数据
  if (window.electronAPI && window.electronAPI.ssh) {
    window.electronAPI.ssh.onStreamData(handleStreamData)
    window.electronAPI.ssh.onStreamEnd(handleStreamEnd)
  }
  
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
  
  // 移除监听器
  if (window.electronAPI && window.electronAPI.ssh) {
    window.electronAPI.ssh.removeStreamDataListener()
    window.electronAPI.ssh.removeStreamEndListener()
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
  background: linear-gradient(135deg, #1a1925 0%, #0d1117 100%);
  position: relative;
  overflow: hidden;
  min-height: 0;
  box-sizing: border-box;
}

/* 装饰性背景动画 */
.ssh-terminal-tab::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle at center, rgba(189, 147, 249, 0.05) 0%, transparent 50%);
  animation: rotate-slow 30s linear infinite;
  pointer-events: none;
}

@keyframes rotate-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 顶部装饰线 */
.ssh-terminal-tab::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, 
    transparent, 
    rgba(255, 121, 198, 0.5), 
    rgba(139, 233, 253, 0.5), 
    rgba(189, 147, 249, 0.5), 
    transparent
  );
  z-index: 10;
  animation: shimmer 3s ease-in-out infinite;
}

@keyframes shimmer {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.8; }
}

.terminal-toolbar {
  display: flex;
  position: relative;
  z-index: 1;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: linear-gradient(135deg, rgba(34, 33, 44, 0.95) 0%, rgba(26, 25, 37, 0.95) 100%);
  backdrop-filter: blur(15px);
  border-bottom: 1px solid rgba(139, 233, 253, 0.1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.terminal-toolbar:hover {
  border-bottom-color: rgba(255, 121, 198, 0.2);
  box-shadow: 0 6px 30px rgba(0, 0, 0, 0.4);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.connection-info {
  font-size: 11px;
  color: #858585;
}

.toolbar-right {
  display: flex;
  gap: 6px;
}

/* 终端包装器 - 占据剩余空间 */
.terminal-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #0d1117;
  color: #e6edf3;
  font-family: 'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: 0.1px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  cursor: text;
  outline: none;
  position: relative;
  min-height: 0;
  box-sizing: border-box;
}

.terminal-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  box-sizing: border-box;
  margin-bottom: 10px; /* 输入框上方留一点间距 */
  padding-bottom: 70px; /* 为绝对定位的输入框留出空间 */
}

.terminal-container.connected {
  border-left: 2px solid rgba(103, 194, 58, 0.4);
  background: linear-gradient(135deg, rgba(103, 194, 58, 0.02) 0%, rgba(13, 17, 23, 1) 100%);
}

.terminal-output {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 16px 12px 16px;
  margin-bottom: 0;
  min-height: 0;
  box-sizing: border-box;
}

.terminal-output::-webkit-scrollbar {
  width: 6px;
}

.terminal-output::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.terminal-output::-webkit-scrollbar-thumb {
  background: #424242;
  border-radius: 3px;
}

.terminal-welcome {
  text-align: center;
  padding: 30px 15px;
  color: #666;
  line-height: 1.8;
}

.terminal-welcome p {
  margin: 6px 0;
  font-size: 11px;
}

.terminal-line {
  margin-bottom: 3px;
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
  padding: 1px 6px;
  border-radius: 3px;
  border-left: 2px solid rgba(255, 123, 114, 0.3);
  margin-left: -6px;
}

.terminal-line.system {
  color: #79c0ff;
  background: rgba(121, 192, 255, 0.05);
  padding: 1px 6px;
  border-radius: 3px;
  border-left: 2px solid rgba(121, 192, 255, 0.3);
  margin-left: -6px;
}

.command-prefix {
  color: #7ee787;
  font-weight: 600;
  margin-right: 4px;
  text-shadow: 0 0 2px rgba(126, 231, 135, 0.3);
}

/* 固定在底部的输入区域 */
.terminal-input-area {
  position: absolute;
  bottom: 10px;
  left: 16px;
  right: 16px;
  height: 50px;
  background: linear-gradient(180deg, rgba(13, 17, 23, 0.95) 0%, rgba(13, 17, 23, 1) 100%);
  border: 1px solid rgba(139, 233, 253, 0.3);
  border-radius: 8px;
  padding: 10px 16px;
  backdrop-filter: blur(15px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  z-index: 9999;
}

.terminal-input-line {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  width: 100%;
}

.prompt {
  color: #7ee787;
  font-weight: 600;
  white-space: nowrap;
  text-shadow: 0 0 2px rgba(126, 231, 135, 0.3);
  font-size: 12px;
  flex-shrink: 0;
}

.command-input {
  flex: 1;
  background: transparent;
  border: none;
  color: #e6edf3;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  outline: none;
  padding: 0;
  transition: all 0.3s;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  caret-color: #7ee787;
  caret-shape: bar;
}

.command-input:disabled {
  opacity: 0.7;
  cursor: wait;
}

/* 流式命令提示 */
.streaming-indicator {
  position: absolute;
  bottom: 10px;
  left: 16px;
  right: 16px;
  height: 50px;
  display: flex;
  align-items: center;
  padding: 10px 16px;
  background: linear-gradient(180deg, rgba(121, 192, 255, 0.15) 0%, rgba(121, 192, 255, 0.2) 100%);
  border: 1px solid rgba(121, 192, 255, 0.4);
  border-left: 3px solid rgba(121, 192, 255, 0.6);
  border-radius: 8px;
  animation: fadeIn 0.3s ease-in;
  backdrop-filter: blur(15px);
  box-shadow: 0 4px 20px rgba(121, 192, 255, 0.3);
  z-index: 9999;
}

.streaming-text {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #79c0ff;
  font-weight: 500;
}

.streaming-dot {
  width: 6px;
  height: 6px;
  background: #79c0ff;
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.2);
  }
}

/* XTerm 终端容器样式 - 高级版 */
.xterm-container {
  flex: 1;
  background: linear-gradient(135deg, #22212C 0%, #1a1925 100%);
  padding: 20px;
  overflow: hidden;
  position: relative;
  min-height: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

/* 添加微妙的网格背景效果 */
.xterm-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: 
    linear-gradient(rgba(139, 233, 253, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(139, 233, 253, 0.03) 1px, transparent 1px);
  background-size: 20px 20px;
  pointer-events: none;
  opacity: 0.5;
}

/* 顶部装饰光晕 */
.xterm-container::after {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 500px;
  height: 150px;
  background: radial-gradient(ellipse at center, rgba(255, 121, 198, 0.15) 0%, transparent 70%);
  pointer-events: none;
  animation: glow 4s ease-in-out infinite;
}

@keyframes glow {
  0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(1); }
  50% { opacity: 0.8; transform: translateX(-50%) scale(1.1); }
}

.xterm-container :deep(.xterm) {
  flex: 1;
  padding: 15px;
  background: rgba(34, 33, 44, 0.6);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(139, 233, 253, 0.1);
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  position: relative;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 终端内部光效 */
.xterm-container :deep(.xterm)::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255, 121, 198, 0.03) 0%, transparent 50%);
  pointer-events: none;
  animation: rotate 20s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.xterm-container :deep(.xterm-viewport) {
  overflow-y: auto !important;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 121, 198, 0.3) rgba(34, 33, 44, 0.2);
}

/* 自定义滚动条 */
.xterm-container :deep(.xterm-viewport)::-webkit-scrollbar {
  width: 10px;
}

.xterm-container :deep(.xterm-viewport)::-webkit-scrollbar-track {
  background: rgba(34, 33, 44, 0.3);
  border-radius: 5px;
}

.xterm-container :deep(.xterm-viewport)::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, rgba(255, 121, 198, 0.4), rgba(189, 147, 249, 0.4));
  border-radius: 5px;
  border: 2px solid transparent;
  background-clip: content-box;
}

.xterm-container :deep(.xterm-viewport)::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, rgba(255, 121, 198, 0.6), rgba(189, 147, 249, 0.6));
  background-clip: content-box;
}

/* 光标闪烁优化 */
.xterm-container :deep(.xterm-cursor-block) {
  animation: cursor-glow 1s ease-in-out infinite;
}

@keyframes cursor-glow {
  0%, 100% { 
    box-shadow: 0 0 5px rgba(255, 121, 198, 0.5);
  }
  50% { 
    box-shadow: 0 0 15px rgba(255, 121, 198, 0.8), 0 0 25px rgba(255, 121, 198, 0.4);
  }
}

/* 选中文本样式 */
.xterm-container :deep(.xterm-selection) {
  background-color: rgba(139, 233, 253, 0.3) !important;
  border-radius: 2px;
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

/* Element Plus 组件样式覆盖 - Dracula Pro 主题 */
.terminal-toolbar :deep(.el-button) {
  transition: all 0.3s ease;
  border: 1px solid rgba(139, 233, 253, 0.2);
  background: linear-gradient(135deg, rgba(255, 121, 198, 0.1) 0%, rgba(189, 147, 249, 0.1) 100%);
  backdrop-filter: blur(5px);
}

.terminal-toolbar :deep(.el-button:hover) {
  border-color: rgba(255, 121, 198, 0.4);
  background: linear-gradient(135deg, rgba(255, 121, 198, 0.2) 0%, rgba(189, 147, 249, 0.2) 100%);
  box-shadow: 0 0 20px rgba(255, 121, 198, 0.3);
  transform: translateY(-1px);
}

.terminal-toolbar :deep(.el-button--primary) {
  background: linear-gradient(135deg, #FF79C6 0%, #BD93F9 100%);
  border: none;
  box-shadow: 0 4px 15px rgba(255, 121, 198, 0.4);
}

.terminal-toolbar :deep(.el-button--primary:hover) {
  background: linear-gradient(135deg, #FF92DF 0%, #D6ACFF 100%);
  box-shadow: 0 6px 25px rgba(255, 121, 198, 0.6);
  transform: translateY(-2px);
}

.terminal-toolbar :deep(.el-button--danger) {
  background: linear-gradient(135deg, #FF6E6E 0%, #FF5555 100%);
  border: none;
  box-shadow: 0 4px 15px rgba(255, 110, 110, 0.4);
}

.terminal-toolbar :deep(.el-button--danger:hover) {
  background: linear-gradient(135deg, #FF8888 0%, #FF7777 100%);
  box-shadow: 0 6px 25px rgba(255, 110, 110, 0.6);
  transform: translateY(-2px);
}

.terminal-toolbar :deep(.el-tag) {
  background: linear-gradient(135deg, rgba(139, 233, 253, 0.15) 0%, rgba(189, 147, 249, 0.15) 100%);
  border: 1px solid rgba(139, 233, 253, 0.3);
  backdrop-filter: blur(5px);
  color: #F8F8F2;
  font-weight: 500;
  padding: 4px 12px;
  transition: all 0.3s ease;
}

.terminal-toolbar :deep(.el-tag--success) {
  background: linear-gradient(135deg, rgba(105, 255, 148, 0.2) 0%, rgba(80, 250, 123, 0.2) 100%);
  border-color: rgba(105, 255, 148, 0.4);
  color: #69FF94;
  box-shadow: 0 0 15px rgba(105, 255, 148, 0.2);
}

.terminal-toolbar :deep(.el-tag--warning) {
  background: linear-gradient(135deg, rgba(255, 255, 165, 0.2) 0%, rgba(241, 250, 140, 0.2) 100%);
  border-color: rgba(255, 255, 165, 0.4);
  color: #FFFFA5;
  box-shadow: 0 0 15px rgba(255, 255, 165, 0.2);
}

.terminal-toolbar :deep(.el-tag--info) {
  background: linear-gradient(135deg, rgba(98, 114, 164, 0.2) 0%, rgba(68, 71, 90, 0.2) 100%);
  border-color: rgba(98, 114, 164, 0.4);
  color: #A4FFFF;
}

.connection-info {
  background: linear-gradient(135deg, rgba(255, 121, 198, 0.1) 0%, rgba(139, 233, 253, 0.1) 100%);
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid rgba(139, 233, 253, 0.2);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #8BE9FD;
  backdrop-filter: blur(5px);
  transition: all 0.3s ease;
}

.connection-info:hover {
  border-color: rgba(255, 121, 198, 0.4);
  box-shadow: 0 0 15px rgba(139, 233, 253, 0.2);
}
</style>

