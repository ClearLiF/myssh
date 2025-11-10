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
        <el-button
          v-if="isConnected"
          size="small"
          @click="openFileManager"
        >
          📁 文件
        </el-button>
        <el-button
          v-if="isConnected"
          size="small"
          @click="openProcessMonitor"
        >
          📊 进程
        </el-button>
        <el-button
          v-if="isConnected"
          size="small"
          @click="openDockerManager"
        >
          🐳 Docker
        </el-button>
        <el-button
          v-if="isConnected"
          size="small"
          @click="openSystemctlManager"
        >
          ⚙️ Systemctl
        </el-button>
        <el-button size="small" @click="clearTerminal" :disabled="!isConnected">
          清空
        </el-button>

        <!-- 搜索和高亮 -->
        <el-input
          v-model="searchText"
          size="small"
          placeholder="🔍 搜索..."
          style="width: 150px; margin: 0 8px"
          clearable
          @input="highlightSearch"
          @keyup.enter="highlightSearch"
        />

        <!-- 选择预览区域 -->
        <div v-if="currentSelection" class="selection-preview">
          <span class="selection-label">已选:</span>
          <span class="selection-text">{{ truncatedSelection }}</span>
        </div>

        <el-button
          size="small"
          @click="copyTerminalSelection"
          :disabled="!isConnected"
          title="复制选中的文本 (Ctrl+Shift+C)"
        >
          📋 复制
        </el-button>
      </div>
    </div>

    <!-- 终端主体区域 -->
    <div class="terminal-body">
      <!-- 左侧面板容器 -->
      <div v-if="isConnected && connectionId" class="left-panel">
        <el-tabs v-model="activeLeftTab" class="left-panel-tabs">
          <!-- 系统监控 Tab -->
          <el-tab-pane name="monitor">
            <template #label>
              <span class="tab-label">
                <el-icon><Monitor /></el-icon>
                <span>监控</span>
              </span>
            </template>
            <CompactMonitor
              :connection-id="connectionId"
              @open-network-monitor="handleOpenNetworkMonitor"
            />
          </el-tab-pane>

          <!-- 端口转发 Tab -->
          <el-tab-pane name="forward">
            <template #label>
              <span class="tab-label">
                <el-icon><Connection /></el-icon>
                <span>转发</span>
              </span>
            </template>
            <PortForwardPanel
              :connection-id="connectionId"
              :connection="props.connection"
            />
          </el-tab-pane>
        </el-tabs>
      </div>

      <!-- xterm.js 终端容器 -->
      <div class="xterm-container" ref="xtermContainer">
        <!-- 自定义选择高亮层 -->
        <div class="selection-overlay" ref="selectionOverlay"></div>
      </div>

      <!-- 右侧脚本面板 -->
      <div v-if="isConnected" class="right-panel" :class="{ collapsed: rightPanelCollapsed }">
        <div class="panel-header">
          <div class="panel-title">
            <el-icon><Document /></el-icon>
            <span>脚本列表</span>
          </div>
          <el-button 
            size="small" 
            text 
            @click="rightPanelCollapsed = !rightPanelCollapsed"
            class="collapse-btn"
          >
            <el-icon>
              <DArrowRight v-if="rightPanelCollapsed" />
              <DArrowLeft v-else />
            </el-icon>
          </el-button>
        </div>
        
        <div v-if="!rightPanelCollapsed" class="panel-content">
          <div class="scripts-list">
            <div class="scripts-header">
              <el-button 
                type="primary" 
                size="small" 
                @click="openScriptManager"
                style="width: 100%;"
              >
                <el-icon><Plus /></el-icon>
                <span>管理脚本</span>
              </el-button>
            </div>
            
            <el-empty v-if="scripts.length === 0" description="暂无脚本" :image-size="60" />
            
            <div v-else class="script-items">
              <div 
                v-for="script in scripts" 
                :key="script.id" 
                class="script-item"
                @click="selectScript(script)"
              >
                <div class="script-item-header">
                  <span class="script-item-name">{{ script.name }}</span>
                  <el-tag :type="getScriptTypeTag(script.type)" size="small">
                    {{ script.type }}
                  </el-tag>
                </div>
                <div class="script-item-desc">{{ script.description || '暂无描述' }}</div>
                <div class="script-item-actions">
                  <el-button 
                    size="small" 
                    type="primary"
                    @click.stop="runScriptInTerminal(script)"
                  >
                    <el-icon><CaretRight /></el-icon>
                    运行
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 脚本运行对话框 -->
    <el-dialog
      v-model="showScriptDialog"
      title="运行脚本"
      width="600px"
      :close-on-click-modal="false"
    >
      <div v-if="selectedScript">
        <el-form label-width="120px">
          <el-form-item label="脚本名称">
            <span>{{ selectedScript.name }}</span>
          </el-form-item>
          
          <div v-if="selectedScript.params && selectedScript.params.length > 0">
            <el-divider content-position="left">参数配置</el-divider>
            <el-form-item 
              v-for="param in selectedScript.params" 
              :key="param.name"
              :label="param.name"
            >
              <el-input 
                v-model="scriptParamValues[param.name]"
                :placeholder="param.description || `请输入${param.name}`"
              />
              <div class="param-hint" v-if="param.defaultValue">
                默认值: {{ param.defaultValue }}
              </div>
            </el-form-item>
          </div>
        </el-form>
        
        <div class="script-preview">
          <el-divider content-position="left">脚本预览</el-divider>
          <el-input
            :model-value="getProcessedScriptContent()"
            type="textarea"
            :rows="8"
            readonly
            class="script-content-preview"
          />
        </div>
      </div>

      <template #footer>
        <el-button @click="showScriptDialog = false">取消</el-button>
        <el-button type="primary" @click="executeScriptInTerminal">执行</el-button>
      </template>
    </el-dialog>
    
    <!-- Toast 通知组件 -->
    <ToastNotification ref="toast" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
// import { ElMessage } from 'element-plus' // 已替换为 ToastNotification
import { SuccessFilled, Loading, Monitor, Connection, Document, DArrowLeft, DArrowRight, CaretRight, Plus } from '@element-plus/icons-vue'
import CompactMonitor from './CompactMonitor.vue'
import PortForwardPanel from './PortForwardPanel.vue'
import ToastNotification from './ToastNotification.vue'
import { authAPI } from '../services/api'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'

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

const emit = defineEmits(['connected', 'disconnected', 'open-sftp', 'open-process-monitor', 'open-network-monitor', 'open-docker-manager', 'open-systemctl-manager'])

// 状态管理
const connecting = ref(false)
const isConnected = ref(false)
const commandExecuting = ref(false)
const isStreamingCommand = ref(false)
const usePtyMode = ref(true) // 默认使用 PTY 模式
const activeLeftTab = ref('monitor') // 左侧面板当前激活的Tab
const toast = ref(null) // Toast 通知组件引用

// 右侧脚本面板
const rightPanelCollapsed = ref(false)
const scripts = ref([])
const selectedScript = ref(null)
const showScriptDialog = ref(false)
const scriptParamValues = ref({})

// PTY 相关
const xtermContainer = ref(null)
let terminal = null
let fitAddon = null
const ptyReady = ref(false)  // 改为 ref，追踪 PTY 是否已创建

// 终端相关
const terminalOutput = ref([])
const currentCommand = ref('')
const currentPrompt = ref('$ ')
const commandHistory = ref([])
const historyIndex = ref(-1)

// 选择预览相关
const currentSelection = ref('')
const selectionOverlay = ref(null)
const searchText = ref('')
let searchAddon = null
const truncatedSelection = computed(() => {
  if (currentSelection.value.length > 50) {
    return currentSelection.value.substring(0, 50) + '...'
  }
  return currentSelection.value
})

// DOM 引用
const terminalOutputRef = ref(null)
const commandInputRef = ref(null)
const terminalContainerRef = ref(null)

// SSH 连接 ID
const connectionId = ref(null)

// 流式数据缓冲区（累积不完整的行）
const streamBuffer = ref('')

// 获取 xterm 主题配置
const getXtermTheme = () => {
  const isDark = !document.documentElement.getAttribute('data-theme') ||
                 document.documentElement.getAttribute('data-theme') === 'dark'

  if (isDark) {
    // 暗色主题 - Dracula Pro
    return {
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
    }
  } else {
    // 明亮主题
    return {
      background: '#FFFFFF',
      foreground: '#202124',
      cursor: '#667EEA',
      cursorAccent: '#FFFFFF',
      selection: 'rgba(102, 126, 234, 0.2)',
      black: '#000000',
      red: '#D32F2F',
      green: '#388E3C',
      yellow: '#F57F17',
      blue: '#1565C0',
      magenta: '#7B1FA2',
      cyan: '#00838F',
      white: '#EEEEEE',
      brightBlack: '#616161',
      brightRed: '#E53935',
      brightGreen: '#43A047',
      brightYellow: '#FB8C00',
      brightBlue: '#1E88E5',
      brightMagenta: '#8E24AA',
      brightCyan: '#00ACC1',
      brightWhite: '#FFFFFF'
    }
  }
}

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
  if (terminal) {
    terminal.clear()
  }
}

// 搜索和高亮文本
const highlightSearch = () => {
  if (!searchAddon || !terminal) return

  if (!searchText.value) {
    searchAddon.clearDecorations()
    // 关闭之前的搜索提示
    // ElMessage.closeAll() // Toast 组件自动管理
    return
  }

  try {
    // 搜索文本并高亮
    const regex = new RegExp(searchText.value, 'gi')
    searchAddon.findNext(searchText.value)

    // 关闭之前的消息，避免频繁搜索时堆叠
    // ElMessage.closeAll() // Toast 组件自动管理
    toast.value?.info(`已高亮搜索: "${searchText.value}"`, '搜索结果', 1500)
  } catch (err) {
    // ElMessage.closeAll() // Toast 组件自动管理
    toast.value?.error('搜索失败: 无效的搜索内容', '搜索错误', 1500)
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
      console.log('🔌 SSHTerminalTab 准备连接:')
      console.log('  - props.connection:', props.connection.name)
      console.log('  - props.connection.tunnels:', props.connection.tunnels)
      console.log('  - tunnels 数量:', (props.connection.tunnels || []).length)
      
      // 使用 JSON 序列化/反序列化来创建纯数据对象，去除 Vue reactive 代理
      // 这可以防止 "An object could not be cloned" 错误
      const plainConfig = JSON.parse(JSON.stringify({
        host: props.connection.host,
        port: props.connection.port,
        username: props.connection.username,
        authType: props.connection.authType,
        password: props.connection.password,
        privateKeyContent: props.connection.privateKeyContent,
        privateKeyPassphrase: props.connection.privateKeyPassphrase,
        tunnels: props.connection.tunnels || []  // 传递端口转发配置
      }))
      
      console.log('  - plainConfig.tunnels:', plainConfig.tunnels)
      console.log('  - plainConfig.tunnels 数量:', plainConfig.tunnels.length)

      const result = await window.electronAPI.ssh.connect(plainConfig)
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

        // 显示端口转发建立结果
        if (result.tunnels && result.tunnels.length > 0) {
          const successCount = result.tunnels.filter(t => t.success).length
          const failCount = result.tunnels.filter(t => !t.success).length

          if (successCount > 0) {
            addTerminalLine({
              type: 'system',
              content: `🔗 已建立 ${successCount} 个端口转发`,
              timestamp: new Date()
            })
          }

          if (failCount > 0) {
            addTerminalLine({
              type: 'error',
              content: `⚠️  ${failCount} 个端口转发建立失败`,
              timestamp: new Date()
            })
          }

          // 显示每个端口转发的详细状态
          result.tunnels.forEach(tunnel => {
            if (tunnel.success) {
              addTerminalLine({
                type: 'system',
                content: `  ✓ ${tunnel.name}`,
                timestamp: new Date()
              })
            } else {
              addTerminalLine({
                type: 'error',
                content: `  ✗ ${tunnel.name}: ${tunnel.error || '未知错误'}`,
                timestamp: new Date()
              })
            }
          })
        }

        currentPrompt.value = `${props.connection.username}@${props.connection.host}:~$ `

        toast.value?.success('SSH 连接成功！', '连接成功')

        // 始终初始化 xterm PTY 模式
        await initializePty()
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

      toast.value?.success('SSH 连接成功！（模拟模式）', '连接成功')
      await nextTick()
      focusInput()
    }
  } catch (error) {
    addTerminalLine({
      type: 'error',
      content: `❌ 连接失败: ${error.message}`,
      timestamp: new Date()
    })
    toast.value?.error(`SSH 连接失败: ${error.message}`, '连接失败')
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
    // 读取终端字体大小设置
    let terminalFontSize = 14 // 默认值
    try {
      const fontSizeResult = await window.electronAPI.settings.getTerminalFontSize()
      if (fontSizeResult.success) {
        terminalFontSize = fontSizeResult.fontSize
      }
    } catch (error) {
      console.warn('无法读取终端字体大小设置，使用默认值:', error)
    }

    // 创建 xterm 实例
    terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      cursorWidth: 2,
      fontSize: terminalFontSize,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, "Courier New", monospace',
      fontWeight: '400',
      fontWeightBold: '700',
      lineHeight: 1.2,
      letterSpacing: 0,
      theme: getXtermTheme(), // 使用动态主题
      allowTransparency: true,
      scrollback: 10000,
      tabStopWidth: 8,
      smoothScrollDuration: 100,
      fastScrollModifier: 'shift',
      fastScrollSensitivity: 5,
      windowsMode: false,
      macOptionIsMeta: true,
      // 新版 xterm 5.5.0 的选择和鼠标配置
      enableBold: true,
      screenKeys: false,
      rightClickSelectsWord: false,  // 禁用右键选词，避免干扰文本选择
      // 启用文本选择模式
      selectionMode: 'normal'
      // 移除了过时的 documentOverride 和 disableStdin 参数
    })

    // 添加插件
    fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())
    searchAddon = new SearchAddon()
    terminal.loadAddon(searchAddon)

    // 挂载到 DOM
    terminal.open(xtermContainer.value)
    fitAddon.fit()

    // 延迟一小段时间，确保 xterm 完全初始化后再配置选择
    await new Promise(resolve => setTimeout(resolve, 100))

    // 注入强制选择支持的全局样式
    const styleId = 'xterm-selection-style'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        /* 启用所有 xterm 元素的文本选择 */
        .xterm, .xterm *, .xterm-row, .xterm-screen, .xterm-rows {
          user-select: text !important;
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
        }
        .xterm-viewport {
          user-select: text !important;
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
        }
        /* 禁用长按菜单，防止干扰选择 */
        .xterm {
          -webkit-touch-callout: none !important;
        }
        /* 增强选择样式的可见性 - 使用高对比度 */
        .xterm-selection {
          background-color: rgba(100, 200, 255, 0.9) !important;
          color: #ffffff !important;
          border-radius: 2px;
          opacity: 1 !important;
        }
        /* 确保光标不会阻止选择 */
        .xterm-cursor {
          pointer-events: none !important;
        }
        /* 禁用 xterm 的默认选择样式覆盖 */
        .xterm-selection-layer {
          z-index: 100 !important;
        }
      `
      document.head.appendChild(style)
    }

    // 关键：启用 xterm 的文本选择功能
    const xtermElement = xtermContainer.value?.querySelector('.xterm')
    if (xtermElement) {
      // 直接设置样式启用选择
      xtermElement.style.userSelect = 'text'
      xtermElement.style.WebkitUserSelect = 'text'
      xtermElement.style.MozUserSelect = 'text'
      // 保持 pointer-events 为 auto，允许鼠标交互
      xtermElement.style.pointerEvents = 'auto'
      // 禁用 -webkit-touch-callout，防止长按菜单干扰选择
      xtermElement.style.WebkitTouchCallout = 'none'
    }

    // 获取 xterm-screen 元素并启用选择
    const xtermScreen = xtermContainer.value?.querySelector('.xterm-screen')
    if (xtermScreen) {
      xtermScreen.style.userSelect = 'text'
      xtermScreen.style.WebkitUserSelect = 'text'
      xtermScreen.style.MozUserSelect = 'text'
      xtermScreen.style.pointerEvents = 'auto'
      xtermScreen.style.WebkitTouchCallout = 'none'
    }

    // 获取 xterm-viewport 并启用选择
    const xtermViewport = xtermContainer.value?.querySelector('.xterm-viewport')
    if (xtermViewport) {
      xtermViewport.style.userSelect = 'text'
      xtermViewport.style.WebkitUserSelect = 'text'
      xtermViewport.style.MozUserSelect = 'text'
    }

    // 监听窗口大小变化
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddon && terminal) {
        fitAddon.fit()
        // 只在 PTY 创建完成后才调整大小
        if (ptyReady.value && window.electronAPI && connectionId.value) {
          window.electronAPI.ssh.ptyResize(
            connectionId.value,
            terminal.cols,
            terminal.rows
          ).catch(error => {
            // 忽略 PTY 不存在的错误
            if (!error.message.includes('PTY shell 不存在')) {
              console.error('调整 PTY 大小失败:', error)
            }
          })
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

    // 添加快捷键处理：Ctrl+Shift+C 复制选中文本
    terminal.attachCustomKeyEventHandler((event) => {
      // Mac: Cmd+C, Windows/Linux: Ctrl+C
      const isCopy = (event.ctrlKey || event.metaKey) && event.code === 'KeyC' && event.shiftKey

      if (isCopy) {
        const selected = terminal.getSelection()
        currentSelection.value = selected // 更新预览
        if (selected) {
          // 关闭之前的消息，避免重复按复制键时堆叠
          // ElMessage.closeAll() // Toast 组件自动管理
          navigator.clipboard.writeText(selected).then(() => {
            toast.value?.success(`已复制 ${selected.length} 个字符到剪贴板`, '复制成功', 2000)
          }).catch(err => {
            console.error('复制失败:', err)
            toast.value?.error('复制失败，请重试', '复制错误', 2000)
          })
          return false // 阻止默认处理
        }
      }
      return true
    })

    // 禁用 xterm 的鼠标事件处理，以允许原生文本选择
    terminal.attachCustomKeyEventHandler((event) => {
      // 允许所有鼠标事件通过，不被 xterm 拦截
      return true
    })

    // 监听鼠标选择变化 - 在 mouseup 时更新预览
    const handleMouseUp = () => {
      // 延迟一小段时间，确保选择已完成
      setTimeout(() => {
        const selected = terminal.getSelection()
        if (selected && selected.length > 0) {
          currentSelection.value = selected
          // 渲染高亮
          renderSelectionHighlight()
          // 只在选择较长文本时显示提示，避免频繁弹出
          if (selected.length > 10) {
            // 关闭之前的消息，避免堆叠
            // ElMessage.closeAll() // Toast 组件自动管理
            toast.value?.info(`已选择 ${selected.length} 个字符，按 Ctrl+Shift+C 复制`, '选择提示', 1500)
          }
        } else {
          currentSelection.value = ''
          // 清空高亮
          if (selectionOverlay.value) {
            selectionOverlay.value.innerHTML = ''
          }
        }
      }, 50)
    }

    xtermElement?.addEventListener('mouseup', handleMouseUp)
    xtermElement?.addEventListener('touchend', handleMouseUp)

    // 启用选择支持：使用 MutationObserver 监听新的行
    const enableSelectionOnRows = () => {
      const rows = xtermContainer.value?.querySelectorAll('.xterm-row')
      if (rows) {
        rows.forEach(row => {
          row.style.userSelect = 'text'
          row.style.WebkitUserSelect = 'text'
          row.style.MozUserSelect = 'text'
        })
      }
    }

    // 渲染选择高亮 - 显示蓝色高亮框
    const renderSelectionHighlight = () => {
      if (!selectionOverlay.value) return

      const selected = terminal.getSelection()
      if (!selected || selected.length === 0) {
        selectionOverlay.value.innerHTML = ''
        return
      }

      // 创建高亮效果 - 使用 xterm 的选择 API 获取选择区域
      const selectionDiv = document.createElement('div')
      selectionDiv.className = 'selection-highlight'
      selectionDiv.textContent = selected
      selectionOverlay.value.innerHTML = ''
      selectionOverlay.value.appendChild(selectionDiv)
    }

    // 初次启用选择
    enableSelectionOnRows()

    // 监听 DOM 变化，新增内容时继续启用选择
    const observer = new MutationObserver(() => {
      enableSelectionOnRows()
    })

    const xtermRows = xtermContainer.value?.querySelector('.xterm-rows')
    if (xtermRows) {
      observer.observe(xtermRows, {
        childList: true,
        subtree: true
      })
    }

    // 创建 PTY shell
    const result = await window.electronAPI.ssh.createPty(
      connectionId.value,
      terminal.cols,
      terminal.rows
    )

    if (result.success) {
      ptyReady.value = true
      // 监听 PTY 输出
      window.electronAPI.ssh.onPtyData((data) => {
        if (data.connectionId === connectionId.value && terminal) {
          terminal.write(data.data)
        }
      })

      // 监听 PTY 关闭
      window.electronAPI.ssh.onPtyClose((data) => {
        if (data.connectionId === connectionId.value) {
          toast.value?.warning('PTY shell 已关闭', 'PTY 状态')
          disconnectSSH()
        }
      })

      toast.value?.success('PTY 终端已启动，支持 vim 等交互式命令！', 'PTY 启动成功')
    } else {
      throw new Error(result.message)
    }
  } catch (error) {
    console.error('初始化 PTY 失败:', error)
    toast.value?.error(`PTY 初始化失败: ${error.message}`, 'PTY 错误')
  }
}

// 断开 SSH 连接
const disconnectSSH = async () => {
  try {
    // 清理 xterm 资源
    ptyReady.value = false
    if (terminal) {
      terminal.dispose()
      terminal = null
    }
    fitAddon = null

    if (window.electronAPI) {
      window.electronAPI.ssh.removePtyDataListener()
      window.electronAPI.ssh.removePtyCloseListener()
    }

    if (window.electronAPI && connectionId.value) {
      await window.electronAPI.ssh.disconnect(connectionId.value)
    }

    isConnected.value = false
    connectionId.value = null

    toast.value?.info('SSH 连接已断开', '连接状态')
  } catch (error) {
    toast.value?.error('断开连接时发生错误', '断开连接失败')
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

// 打开文件管理器
const openFileManager = async () => {
  console.log('📁 SSHTerminalTab 打开文件管理器')
  console.log('  - isConnected:', isConnected.value)
  console.log('  - connectionId:', connectionId.value)
  
  if (!isConnected.value) {
    console.warn('⚠️ SSH 未连接')
    toast.value?.warning('请先连接 SSH 才能打开文件管理器', '连接提示')
    return
  }
  
  if (!connectionId.value) {
    console.error('❌ connectionId 为空，但 isConnected 为 true，这是一个错误状态')
    toast.value?.error('SSH 连接状态异常，请重新连接', '连接错误')
    return
  }

  console.log('✅ 发送 open-sftp 事件，connectionId:', connectionId.value)
  
  // 直接触发事件，让父组件创建新tab
  emit('open-sftp', {
    connectionId: connectionId.value
  })
}

// 打开进程监控
const openProcessMonitor = () => {
  if (!isConnected.value) {
    toast.value?.warning('请先连接 SSH', '连接提示')
    return
  }

  emit('open-process-monitor', {
    connectionId: connectionId.value
  })
}

// 打开网络监控
const handleOpenNetworkMonitor = () => {
  if (!isConnected.value) {
    toast.value?.warning('请先连接 SSH', '连接提示')
    return
  }

  emit('open-network-monitor', {
    connectionId: connectionId.value
  })
}

// 打开 Docker 管理
const openDockerManager = () => {
  if (!isConnected.value) {
    toast.value?.warning('请先连接 SSH', '连接提示')
    return
  }

  emit('open-docker-manager', {
    connectionId: connectionId.value
  })
}

// 打开 Systemctl 管理
const openSystemctlManager = () => {
  if (!isConnected.value) {
    toast.value?.warning('请先连接 SSH', '连接提示')
    return
  }

  emit('open-systemctl-manager', {
    connectionId: connectionId.value
  })
}

// ============ 脚本管理相关函数 ============

// 加载脚本列表
const loadScripts = () => {
  try {
    if (!authAPI.isAuthenticated()) {
      // 未登录时从本地存储加载
      const localScripts = localStorage.getItem('local_scripts')
      if (localScripts) {
        scripts.value = JSON.parse(localScripts)
      }
      return
    }

    // 已登录从用户 otherInfo 加载
    const otherInfo = authAPI.getUserOtherInfo()
    if (otherInfo.script && Array.isArray(otherInfo.script)) {
      scripts.value = otherInfo.script
      console.log('✅ 从云端加载脚本:', scripts.value.length, '个')
    } else {
      scripts.value = []
    }
  } catch (error) {
    console.error('加载脚本失败:', error)
  }
}

// 获取脚本类型标签样式
const getScriptTypeTag = (type) => {
  const typeMap = {
    shell: 'primary',
    python: 'success',
    javascript: 'warning',
    command: '',
    other: 'info'
  }
  return typeMap[type] || 'info'
}

// 打开脚本管理器
const openScriptManager = () => {
  // 触发打开脚本管理器标签页的自定义事件（在 App.vue 中监听）
  window.dispatchEvent(new CustomEvent('request-open-script-manager'))
}

// 选择脚本
const selectScript = (script) => {
  selectedScript.value = JSON.parse(JSON.stringify(script)) // 深拷贝
}

// 运行脚本
const runScriptInTerminal = (script) => {
  selectedScript.value = JSON.parse(JSON.stringify(script)) // 深拷贝
  
  // 初始化参数值
  scriptParamValues.value = {}
  if (script.params && script.params.length > 0) {
    script.params.forEach(param => {
      scriptParamValues.value[param.name] = param.defaultValue || ''
    })
    // 有参数，显示对话框
    showScriptDialog.value = true
  } else {
    // 无参数，直接执行
    executeScriptInTerminal()
  }
}

// 获取处理后的脚本内容（替换参数）
const getProcessedScriptContent = () => {
  if (!selectedScript.value) return ''
  
  let processed = selectedScript.value.content
  
  // 替换参数
  for (let paramName in scriptParamValues.value) {
    const value = scriptParamValues.value[paramName]
    const regex = new RegExp(`\\$\\{${paramName}\\}`, 'g')
    processed = processed.replace(regex, value)
  }
  
  return processed
}

// 在终端中执行脚本
const executeScriptInTerminal = async () => {
  if (!isConnected.value || !ptyReady.value) {
    toast.value?.warning('请先连接 SSH', '连接提示')
    return
  }

  showScriptDialog.value = false
  
  const processedScript = getProcessedScriptContent()
  
  // 在终端中显示脚本标题
  terminal.writeln('\r\n\x1b[1;32m========== 执行脚本: ' + selectedScript.value.name + ' ==========\x1b[0m\r')
  
  // 将脚本按行拆分
  const lines = processedScript.split('\n').filter(line => {
    const trimmed = line.trim()
    // 过滤空行和注释行（但保留 shebang）
    return trimmed && (trimmed.startsWith('#!') || !trimmed.startsWith('#'))
  })
  
  if (!window.electronAPI || !window.electronAPI.ssh || !connectionId.value) {
    toast.value?.error('SSH API 不可用', '执行错误')
    return
  }

  try {
    // 逐行执行命令
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      // 跳过 shebang 行
      if (line.startsWith('#!')) {
        continue
      }
      
      // 将命令发送到 PTY（就像用户在终端输入一样）
      window.electronAPI.ssh.ptyWrite(connectionId.value, line + '\r')
      
      // 短暂延迟，让命令执行和输出显示完整
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    terminal.writeln('\r\n\x1b[1;32m========== 脚本执行完成 ==========\x1b[0m\r')
    toast.value?.success('脚本执行完成', '执行成功')
  } catch (error) {
    console.error('执行脚本失败:', error)
    terminal.writeln('\r\n\x1b[1;31m脚本执行失败: ' + error.message + '\x1b[0m\r')
    toast.value?.error('脚本执行失败: ' + error.message, '执行错误')
  }
}

// ============ 脚本管理相关函数结束 ============

// 复制终端选中的文本
const copyTerminalSelection = () => {
  const selected = terminal.getSelection();
  // 关闭之前的所有消息，避免堆叠
  // ElMessage.closeAll() // Toast 组件自动管理
  if (selected) {
    navigator.clipboard.writeText(selected).then(() => {
      toast.value?.success(`已复制 ${selected.length} 个字符到剪贴板`, '复制成功', 2000);
    }).catch(err => {
      console.error('复制失败:', err);
      toast.value?.error('复制失败，请检查权限', '复制错误', 2000);
    });
  } else {
    toast.value?.warning('没有选中的文本。请用鼠标拖动选择文本，或按 Ctrl+Shift+C', '选择提示', 2500);
  }
};

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

  // 监听主题变化
  const themeObserver = new MutationObserver(() => {
    if (terminal) {
      const newTheme = getXtermTheme()
      terminal.setOption('theme', newTheme)
    }
  })

  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  })

  // 加载脚本列表
  loadScripts()

  // 监听脚本更新事件
  window.addEventListener('scripts-updated', loadScripts)
})

onUnmounted(() => {
  if (isConnected.value) {
    disconnectSSH()
  }

  // 移除事件监听
  window.removeEventListener('scripts-updated', loadScripts)

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
  background: var(--bg-primary);
  color: var(--text-primary);
  position: relative;
  min-height: 0;
  box-sizing: border-box;
  transition: background-color 0.3s ease, color 0.3s ease;
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
  background: var(--bg-secondary);
  backdrop-filter: blur(15px);
  border-bottom: 1px solid var(--border-color-light);
  box-shadow: 0 4px 20px var(--shadow-color);
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.terminal-toolbar:hover {
  border-bottom-color: rgba(255, 121, 198, 0.2);
  box-shadow: 0 6px 30px var(--shadow-color);
}

/* 终端主体区域 */
.terminal-body {
  display: flex;
  flex: 1;
  min-height: 0;
  position: relative;
}

/* 左侧面板容器 */
.left-panel {
  flex-shrink: 0;
  width: 240px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color-light);
  background: var(--bg-secondary);
  overflow: hidden;
}

/* 左侧面板标签页 */
.left-panel-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.left-panel-tabs :deep(.el-tabs__header) {
  margin: 0;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  padding: 0 8px;
  width: 100%;
}

.left-panel-tabs :deep(.el-tabs__nav-wrap) {
  width: 100%;
}

.left-panel-tabs :deep(.el-tabs__nav-wrap)::after {
  display: none;
}

.left-panel-tabs :deep(.el-tabs__nav) {
  width: 100%;
  display: flex;
}

.left-panel-tabs :deep(.el-tabs__item) {
  color: var(--text-secondary);
  font-size: 11px;
  height: 36px;
  line-height: 36px;
  padding: 0 12px;
  border: none;
  background: transparent;
  transition: all 0.3s;
  flex: 1;
  text-align: center;
  justify-content: center;
}

.left-panel-tabs :deep(.el-tabs__item:hover) {
  color: var(--text-primary);
  background: rgba(139, 233, 253, 0.05);
}

.left-panel-tabs :deep(.el-tabs__item.is-active) {
  color: #8BE9FD;
  background: rgba(139, 233, 253, 0.1);
}

.left-panel-tabs :deep(.el-tabs__active-bar) {
  background: #8BE9FD;
  height: 2px;
}

.left-panel-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
  padding: 0;
  width: 100%;
}

.left-panel-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: hidden;
  width: 100%;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
}

.tab-label .el-icon {
  font-size: 14px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.connection-info {
  font-size: 11px;
  color: var(--text-secondary);
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
  background: var(--bg-primary);
  color: var(--text-primary);
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
  transition: background-color 0.3s ease, color 0.3s ease;
}

.terminal-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  box-sizing: border-box;
  margin-bottom: 0;
}

.terminal-container.connected {
  border-left: 2px solid rgba(103, 194, 58, 0.4);
  background: linear-gradient(135deg, rgba(103, 194, 58, 0.02) 0%, var(--bg-primary) 100%);
}

.terminal-output {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 16px 12px 16px;
  margin-bottom: 0;
  min-height: 0;
  box-sizing: border-box;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.terminal-output::-webkit-scrollbar {
  width: 6px;
}

.terminal-output::-webkit-scrollbar-track {
  background: var(--scrollbar-bg);
}

.terminal-output::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 3px;
}

.terminal-welcome {
  text-align: center;
  padding: 30px 15px;
  color: var(--text-secondary);
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
  color: var(--text-primary);
  font-weight: 500;
  text-shadow: 0 0 1px rgba(230, 237, 243, 0.5);
}

.terminal-line.output {
  color: var(--text-primary);
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
  flex-shrink: 0;
  height: 50px;
  margin: 0 16px 10px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  padding: 10px 16px;
  backdrop-filter: blur(15px);
  box-shadow: 0 4px 20px var(--shadow-color);
  display: flex;
  align-items: center;
  transition: all 0.3s ease;
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
  color: var(--text-primary);
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
  flex-shrink: 0;
  height: 50px;
  margin: 0 16px 10px 16px;
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

/* XTerm 终端容器样式 */
.xterm-container {
  flex: 1;
  background: var(--bg-primary);
  padding: 0;
  overflow: hidden;
  position: relative;
  min-height: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  transition: background-color 0.3s ease;
}

/* 添加微妙的网格背景效果 - 不覆盖文本选择 */
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
  z-index: -1;  /* 改为 -1，不覆盖文本 */
}

/* 顶部装饰光晕 - 不覆盖文本选择 */
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
  z-index: -1;  /* 改为 -1，不覆盖文本 */
}

@keyframes glow {
  0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(1); }
  50% { opacity: 0.8; transform: translateX(-50%) scale(1.1); }
}

.xterm-container :deep(.xterm) {
  flex: 1;
  padding: 0;
  background: transparent;
  backdrop-filter: none;
  border-radius: 0;
  border: none;
  box-shadow: none;
  position: relative;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
  z-index: 10;  /* 提高 z-index，确保在装饰元素上方 */
  color: var(--text-primary) !important;
  user-select: text !important;
}

/* 启用终端内容的文本选择 */
.xterm-container :deep(.xterm-rows) {
  user-select: text !important;
}

.xterm-container :deep(.xterm-helper-textarea) {
  user-select: text !important;
}

/* 启用 xterm-screen 的选择 */
.xterm-container :deep(.xterm-screen) {
  user-select: text !important;
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
}

/* 启用单个行的选择 */
.xterm-container :deep(.xterm-row) {
  user-select: text !important;
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
  pointer-events: auto !important;
}

/* 强制启用 xterm-cell 的选择 */
.xterm-container :deep(.xterm-cell) {
  user-select: text !important;
  -webkit-user-select: text !important;
}

/* 确保游标不会影响选择 */
.xterm-container :deep(.xterm-cursor) {
  user-select: text !important;
  pointer-events: none !important;
}

/* 终端内部光效 - 移除，防止显示问题 */
.xterm-container :deep(.xterm)::before {
  display: none;
}

.xterm-container :deep(.xterm-viewport) {
  overflow-y: auto !important;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-bg);
  background: var(--bg-primary);
}

/* 自定义滚动条 */
.xterm-container :deep(.xterm-viewport)::-webkit-scrollbar {
  width: 10px;
}

.xterm-container :deep(.xterm-viewport)::-webkit-scrollbar-track {
  background: var(--scrollbar-bg);
  border-radius: 5px;
}

.xterm-container :deep(.xterm-viewport)::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, var(--scrollbar-thumb), var(--scrollbar-thumb-hover));
  border-radius: 5px;
  border: 2px solid transparent;
  background-clip: content-box;
}

.xterm-container :deep(.xterm-viewport)::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
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

/* 选中文本样式 - 确保高亮可见 */
.xterm-container :deep(.xterm-selection) {
  background-color: rgba(100, 200, 255, 0.8) !important;
  color: #ffffff !important;
  border-radius: 2px;
  box-shadow: 0 0 8px rgba(100, 200, 255, 1) !important;
  z-index: 100 !important;
  position: relative !important;
}

/* 确保选择层在最上方 */
.xterm-container :deep(.xterm-rows) {
  position: relative;
  z-index: 10;
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

/* Element Plus 组件样式覆盖 */
.terminal-toolbar :deep(.el-button) {
  transition: all 0.3s ease;
  border: 1px solid var(--border-color-light);
  background: rgba(102, 126, 234, 0.1);
  backdrop-filter: blur(5px);
  color: var(--text-primary);
}

.terminal-toolbar :deep(.el-button:hover) {
  border-color: rgba(102, 126, 234, 0.4);
  background: rgba(102, 126, 234, 0.2);
  box-shadow: 0 0 20px rgba(102, 126, 234, 0.3);
  transform: translateY(-1px);
  color: var(--text-primary);
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

/* 选择预览区域 */
.selection-preview {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: linear-gradient(135deg, rgba(100, 200, 255, 0.15) 0%, rgba(139, 233, 253, 0.1) 100%);
  border: 1px solid rgba(100, 200, 255, 0.3);
  border-radius: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #64C8FF;
  max-width: 250px;
  backdrop-filter: blur(5px);
  transition: all 0.3s ease;
}

.selection-label {
  font-weight: 600;
  color: #FFD700;
  text-transform: uppercase;
}

.selection-text {
  color: #64C8FF;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
  font-weight: 500;
}

.selection-preview:hover {
  background: linear-gradient(135deg, rgba(100, 200, 255, 0.25) 0%, rgba(139, 233, 253, 0.15) 100%);
  border-color: rgba(100, 200, 255, 0.5);
  box-shadow: 0 0 10px rgba(100, 200, 255, 0.2);
}

/* 选择高亮层 */
.selection-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 5;  /* 在 xterm 下方，不覆盖选择 */
  overflow: hidden;
  border-radius: 4px;
}

.selection-highlight {
  background: linear-gradient(120deg,
    rgba(100, 200, 255, 0.4) 0%,
    rgba(100, 200, 255, 0.3) 50%,
    rgba(139, 233, 253, 0.4) 100%);
  color: rgba(255, 255, 255, 0.8);
  padding: 8px 12px;
  margin: 4px;
  border-radius: 3px;
  border-left: 3px solid #64C8FF;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.4;
  max-height: 200px;
  overflow: auto;
  box-shadow: 0 0 8px rgba(100, 200, 255, 0.3);
  animation: highlightPulse 0.3s ease-out;
}

@keyframes highlightPulse {
  0% {
    opacity: 0;
    transform: scale(0.95);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

/* 右侧脚本面板 */
.right-panel {
  flex-shrink: 0;
  width: 280px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-color-light);
  background: var(--bg-secondary);
  overflow: hidden;
  transition: all 0.3s ease;
}

.right-panel.collapsed {
  width: 40px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.collapse-btn {
  padding: 4px;
  min-height: auto;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.scripts-list {
  padding: 12px;
}

.scripts-header {
  margin-bottom: 12px;
}

.script-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.script-item {
  padding: 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
}

.script-item:hover {
  border-color: #667eea;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
  transform: translateY(-1px);
}

.script-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.script-item-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.script-item-desc {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

.script-item-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.param-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.script-content-preview {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
}

.script-preview {
  margin-top: 16px;
}

</style>

