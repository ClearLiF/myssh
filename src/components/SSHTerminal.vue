<template>
  <div class="ssh-terminal">
    <!-- 连接列表区域 -->
    <el-card class="connections-list-card">
      <template #header>
        <div class="card-header">
          <span>保存的连接</span>
          <el-button type="primary" size="small" @click="showNewConnectionDialog">
            <el-icon><Plus /></el-icon>
            新建连接
          </el-button>
        </div>
      </template>
      
      <div class="connections-list">
        <div 
          v-if="savedConnections.length === 0" 
          class="empty-connections"
        >
          <el-empty description="暂无保存的连接">
            <el-button type="primary" @click="showNewConnectionDialog">新建连接</el-button>
          </el-empty>
        </div>
        
        <div 
          v-for="(conn, index) in savedConnections" 
          :key="index"
          class="connection-item"
          :class="{ 'active': currentConnectionIndex === index }"
          @click="selectConnection(index)"
        >
          <div class="connection-info">
            <div class="connection-name">
              <el-icon><Monitor /></el-icon>
              <strong>{{ conn.name || `${conn.username}@${conn.host}` }}</strong>
            </div>
            <div class="connection-details">
              <el-tag size="small" type="info">{{ conn.host }}:{{ conn.port }}</el-tag>
              <el-tag size="small">{{ conn.username }}</el-tag>
              <el-tag size="small" :type="conn.authType === 'password' ? 'warning' : 'success'">
                {{ conn.authType === 'password' ? '密码' : '私钥' }}
              </el-tag>
            </div>
          </div>
          <div class="connection-actions">
            <el-button 
              type="primary" 
              size="small"
              @click.stop="quickConnect(index)"
              :loading="connecting && currentConnectionIndex === index"
              :disabled="isConnected"
            >
              连接
            </el-button>
            <el-button 
              size="small"
              @click.stop="editConnection(index)"
              :disabled="isConnected"
            >
              编辑
            </el-button>
            <el-button 
              type="danger" 
              size="small"
              @click.stop="deleteConnection(index)"
              :disabled="isConnected"
            >
              删除
            </el-button>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 连接配置区域 -->
    <el-card class="connection-card">
      <template #header>
        <div class="card-header">
          <span>SSH 连接配置</span>
          <div class="header-actions">
            <el-button 
              type="primary" 
              @click="connectSSH"
              :loading="connecting"
              :disabled="!isFormValid"
            >
              {{ isConnected ? '断开连接' : '连接' }}
            </el-button>
            <el-button @click="saveConnection" :disabled="!isFormValid">
              保存配置
            </el-button>
            <el-button @click="loadConnection">
              加载配置
            </el-button>
          </div>
        </div>
      </template>
      
      <el-form :model="sshConfig" label-width="100px" class="ssh-form">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="主机地址" required>
              <el-input 
                v-model="sshConfig.host" 
                placeholder="例如: 192.168.1.100"
                :disabled="isConnected"
                @keyup.enter="connectSSH"
              />
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="端口">
              <el-input-number 
                v-model="sshConfig.port" 
                :min="1" 
                :max="65535"
                :disabled="isConnected"
                controls-position="right"
              />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="用户名" required>
              <el-input 
                v-model="sshConfig.username" 
                placeholder="SSH 用户名"
                :disabled="isConnected"
                @keyup.enter="connectSSH"
              />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="认证方式">
              <el-select 
                v-model="sshConfig.authType" 
                placeholder="选择认证方式"
                :disabled="isConnected"
              >
                <el-option label="密码" value="password" />
                <el-option label="私钥" value="privateKey" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row v-if="sshConfig.authType === 'password'">
          <el-col :span="12">
            <el-form-item label="密码" required>
              <el-input 
                v-model="sshConfig.password" 
                type="password" 
                placeholder="SSH 密码"
                :disabled="isConnected"
                show-password
                @keyup.enter="connectSSH"
              />
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row v-if="sshConfig.authType === 'privateKey'">
          <el-col :span="16">
            <el-form-item label="私钥文件" required>
              <el-input 
                v-model="sshConfig.privateKeyPath" 
                placeholder="私钥文件路径"
                :disabled="isConnected"
              >
                <template #append>
                  <el-button @click="selectPrivateKey" :disabled="isConnected">
                    选择文件
                  </el-button>
                </template>
              </el-input>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>

    <!-- 终端区域 -->
    <el-card class="terminal-card">
      <template #header>
        <div class="card-header">
          <span v-if="isConnected">
            终端 - {{ sshConfig.username }}@{{ sshConfig.host }}:{{ sshConfig.port }}
          </span>
          <span v-else>SSH 终端（未连接）</span>
          <div class="terminal-actions">
            <el-button 
              size="small" 
              @click="clearTerminal"
              :disabled="!isConnected"
            >
              清空
            </el-button>
            <el-button 
              type="danger" 
              size="small" 
              @click="disconnectSSH"
              :disabled="!isConnected"
            >
              断开连接
            </el-button>
          </div>
        </div>
      </template>
      
      <div class="terminal-container" :class="{ 'connected': isConnected }">
        <div class="terminal-output" ref="terminalOutputRef" @click="focusInput">
          <div v-if="!isConnected" class="terminal-welcome">
            <p v-if="isElectronMode">🚀 真实 SSH 模式已启用</p>
            <p v-else>⚠️ 当前为模拟模式，请使用 "npm run electron:dev" 启动真实 SSH 功能</p>
            <p>🔧 请先配置并连接 SSH 服务器</p>
            <p>连接成功后，您可以在这里执行命令</p>
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
            placeholder="输入命令并按 Enter 执行..."
            class="command-input"
            :disabled="!isConnected || commandExecuting"
          />
        </div>
      </div>
    </el-card>

    <!-- 连接状态提示 -->
    <el-alert
      v-if="connectionStatus"
      :title="connectionStatus.title"
      :type="connectionStatus.type"
      :description="connectionStatus.description"
      show-icon
      :closable="true"
      @close="connectionStatus = null"
      class="status-alert"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Monitor } from '@element-plus/icons-vue'

// SSH 配置
const sshConfig = ref({
  host: '',
  port: 22,
  username: '',
  authType: 'password',
  password: '',
  privateKeyPath: ''
})

// 状态管理
const connecting = ref(false)
const isConnected = ref(false)
const connectionStatus = ref(null)
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

// 保存的连接列表
const savedConnections = ref([])
const currentConnectionIndex = ref(-1)

// 检测是否在 Electron 环境中
const isElectronMode = computed(() => {
  return typeof window !== 'undefined' && !!window.electronAPI
})

// 表单验证
const isFormValid = computed(() => {
  const { host, username, authType, password, privateKeyPath } = sshConfig.value
  if (!host.trim() || !username.trim()) return false
  
  if (authType === 'password') {
    return !!password
  } else if (authType === 'privateKey') {
    return !!privateKeyPath
  }
  
  return false
})

// 连接 SSH
const connectSSH = async () => {
  if (isConnected.value) {
    await disconnectSSH()
    return
  }

  connecting.value = true
  connectionStatus.value = {
    title: '正在连接...',
    type: 'info',
    description: `正在连接到 ${sshConfig.value.host}:${sshConfig.value.port}`
  }

  try {
    // 检查是否在 Electron 环境中
    if (window.electronAPI) {
      // 使用 JSON 序列化/反序列化来创建纯数据对象，去除 Vue reactive 代理
      // 这可以防止 "An object could not be cloned" 错误
      const plainConfig = JSON.parse(JSON.stringify({
        host: sshConfig.value.host,
        port: sshConfig.value.port,
        username: sshConfig.value.username,
        authType: sshConfig.value.authType,
        password: sshConfig.value.password,
        privateKeyPath: sshConfig.value.privateKeyPath
      }))
      
      const result = await window.electronAPI.ssh.connect(plainConfig)
      if (result.success) {
        connectionId.value = result.connectionId
        isConnected.value = true
        
        // 添加欢迎信息
        addTerminalLine({
          type: 'system',
          content: `✅ 已连接到 ${sshConfig.value.host}`,
          timestamp: new Date()
        })
        addTerminalLine({
          type: 'system',
          content: `用户: ${sshConfig.value.username}`,
          timestamp: new Date()
        })
        addTerminalLine({
          type: 'system', 
          content: `连接时间: ${new Date().toLocaleString()}`,
          timestamp: new Date()
        })
        
        currentPrompt.value = `${sshConfig.value.username}@${sshConfig.value.host}:~$ `
        
        ElMessage.success('SSH 连接成功！')
        connectionStatus.value = {
          title: '连接成功',
          type: 'success',
          description: `已成功连接到 ${sshConfig.value.host}`
        }
        
        // 聚焦到命令输入框
        await nextTick()
        focusInput()
      } else {
        throw new Error(result.message)
      }
    } else {
      // 模拟连接（开发环境）
      await new Promise(resolve => setTimeout(resolve, 1500))
      isConnected.value = true
      currentPrompt.value = `${sshConfig.value.username}@${sshConfig.value.host}:~$ `
      
      addTerminalLine({
        type: 'system',
        content: `🔧 模拟连接到 ${sshConfig.value.host} (开发模式)`,
        timestamp: new Date()
      })
      
      ElMessage.success('SSH 连接成功！（模拟模式）')
      connectionStatus.value = {
        title: '连接成功',
        type: 'success',
        description: `已成功连接到 ${sshConfig.value.host} (模拟模式)`
      }
      
      await nextTick()
      focusInput()
    }
  } catch (error) {
    connectionStatus.value = {
      title: '连接失败',
      type: 'error',
      description: error.message || '无法连接到远程主机'
    }
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
    
    connectionStatus.value = {
      title: '已断开连接',
      type: 'warning',
      description: 'SSH 连接已断开'
    }
    
    ElMessage.info('SSH 连接已断开')
  } catch (error) {
    ElMessage.error('断开连接时发生错误')
  }
}

// 发送命令
const sendCommand = async () => {
  const command = currentCommand.value.trim()
  if (!command || !isConnected.value || commandExecuting.value) return
  
  // 添加命令到历史记录
  if (command !== commandHistory.value[commandHistory.value.length - 1]) {
    commandHistory.value.push(command)
    if (commandHistory.value.length > 100) {
      commandHistory.value.shift()
    }
  }
  historyIndex.value = commandHistory.value.length
  
  // 显示命令
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
      // 真实的 SSH 命令执行
      const result = await window.electronAPI.ssh.execute(String(connectionId.value), String(command))
      
      if (result.success) {
        // 更新当前目录信息
        if (result.currentDir) {
          currentPrompt.value = `${sshConfig.value.username}@${sshConfig.value.host}:${result.currentDir}$ `
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
      // 模拟命令执行（开发环境）
      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 800))
      
      // 模拟一些常见命令的输出
      let output = ''
      if (command === 'ls' || command === 'ls -la') {
        output = 'drwxr-xr-x  2 user user 4096 Jan 15 10:30 Documents\ndrwxr-xr-x  2 user user 4096 Jan 15 10:30 Downloads\n-rw-r--r--  1 user user  123 Jan 15 10:30 README.md'
      } else if (command === 'pwd') {
        output = '/home/user'
      } else if (command === 'whoami') {
        output = sshConfig.value.username
      } else if (command === 'date') {
        output = new Date().toString()
      } else if (command.startsWith('echo ')) {
        output = command.substring(5)
      } else if (command === 'clear') {
        clearTerminal()
        commandExecuting.value = false
        return
      } else {
        output = `模拟执行命令: ${command}\n命令已执行完成`
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
  } else if (event.key === 'Tab') {
    event.preventDefault()
    // 简单的命令补全
    const commonCommands = ['ls', 'cd', 'pwd', 'cat', 'grep', 'find', 'ps', 'top', 'df', 'free']
    const currentCmd = currentCommand.value.trim()
    if (currentCmd) {
      const matches = commonCommands.filter(cmd => cmd.startsWith(currentCmd))
      if (matches.length === 1) {
        currentCommand.value = matches[0] + ' '
      }
    }
  }
}

// 格式化输出
const formatOutput = (content) => {
  if (!content) return ''
  
  // 转义 HTML 特殊字符
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  
  // 处理换行
  return escaped.replace(/\n/g, '<br>')
}

// 从文件系统加载连接列表
const loadSavedConnections = async () => {
  try {
    if (window.connectionAPI) {
      const result = await window.connectionAPI.loadConnections()
      if (result.success) {
        savedConnections.value = result.connections
        console.log('已加载连接配置:', savedConnections.value.length)
      } else {
        console.error('加载连接配置失败:', result.message)
        savedConnections.value = []
      }
    } else {
      // 降级到 localStorage
      const connections = JSON.parse(localStorage.getItem('ssh-connections') || '[]')
      savedConnections.value = connections
    }
  } catch (error) {
    console.error('加载连接配置失败:', error)
    savedConnections.value = []
  }
}

// 保存连接列表到文件系统
const saveSavedConnections = async () => {
  try {
    if (window.connectionAPI) {
      // 创建可序列化的副本，只包含需要的字段
      const serializedConnections = savedConnections.value.map(conn => ({
        name: conn.name,
        host: conn.host,
        port: conn.port,
        username: conn.username,
        authType: conn.authType,
        password: conn.password,
        privateKeyPath: conn.privateKeyPath
      }))
      
      const result = await window.connectionAPI.saveConnections(serializedConnections)
      if (result.success) {
        ElMessage.success('连接配置已保存')
        console.log('连接配置已保存')
      } else {
        console.error('保存连接配置失败:', result.message)
        ElMessage.error('保存配置失败: ' + result.message)
      }
    } else {
      // 降级到 localStorage
      localStorage.setItem('ssh-connections', JSON.stringify(savedConnections.value))
      ElMessage.success('连接配置已保存')
    }
  } catch (error) {
    console.error('保存连接配置失败:', error)
    ElMessage.error('保存配置失败')
  }
}

// 显示新建连接对话框
const showNewConnectionDialog = async () => {
  try {
    const { value: name } = await ElMessageBox.prompt(
      '请输入连接名称',
      '新建连接',
      {
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputPattern: /.+/,
        inputErrorMessage: '连接名称不能为空'
      }
    )
    
    if (name) {
      const newConnection = {
        name: name,
        host: '',
        port: 22,
        username: '',
        authType: 'password',
        password: '',
        privateKeyPath: ''
      }
      savedConnections.value.push(newConnection)
      saveSavedConnections()
      currentConnectionIndex.value = savedConnections.value.length - 1
      Object.assign(sshConfig.value, newConnection)
      ElMessage.success('连接已创建，请配置连接信息')
    }
  } catch {
    // 用户取消
  }
}

// 选择连接
const selectConnection = (index) => {
  if (isConnected.value) {
    ElMessage.warning('请先断开当前连接')
    return
  }
  
  currentConnectionIndex.value = index
  const connection = savedConnections.value[index]
  Object.assign(sshConfig.value, connection)
}

// 快速连接
const quickConnect = async (index) => {
  if (isConnected.value) {
    ElMessage.warning('请先断开当前连接')
    return
  }
  
  currentConnectionIndex.value = index
  const connection = savedConnections.value[index]
  Object.assign(sshConfig.value, connection)
  await connectSSH()
}

// 编辑连接
const editConnection = (index) => {
  currentConnectionIndex.value = index
  const connection = savedConnections.value[index]
  Object.assign(sshConfig.value, connection)
  ElMessage.info('请在下方配置区域修改连接信息')
}

// 删除连接
const deleteConnection = async (index) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除连接 "${savedConnections.value[index].name}" 吗？`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    savedConnections.value.splice(index, 1)
    saveSavedConnections()
    
    if (currentConnectionIndex.value === index) {
      currentConnectionIndex.value = -1
      // 清空配置表单
      sshConfig.value = {
        host: '',
        port: 22,
        username: '',
        authType: 'password',
        password: '',
        privateKeyPath: ''
      }
    } else if (currentConnectionIndex.value > index) {
      currentConnectionIndex.value--
    }
    
    ElMessage.success('连接已删除')
  } catch {
    // 用户取消
  }
}

// 保存当前连接配置
const saveConnection = () => {
  if (currentConnectionIndex.value >= 0) {
    // 更新现有连接
    Object.assign(savedConnections.value[currentConnectionIndex.value], sshConfig.value)
    saveSavedConnections()
    ElMessage.success('连接配置已更新')
  } else {
    // 保存为新连接
    ElMessageBox.prompt(
      '请输入连接名称',
      '保存连接',
      {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: `${sshConfig.value.username}@${sshConfig.value.host}`,
        inputPattern: /.+/,
        inputErrorMessage: '连接名称不能为空'
      }
    ).then(({ value }) => {
      const config = {
        name: value,
        ...sshConfig.value
      }
      savedConnections.value.push(config)
      saveSavedConnections()
      currentConnectionIndex.value = savedConnections.value.length - 1
      ElMessage.success('连接配置已保存')
    }).catch(() => {
      // 用户取消
    })
  }
}

// 加载连接配置（保留用于兼容）
const loadConnection = async () => {
  if (savedConnections.value.length === 0) {
    ElMessage.info('没有保存的连接配置')
    return
  }
  
  try {
    const { value: selectedIndex } = await ElMessageBox.prompt(
      '选择要加载的连接配置:',
      '加载配置',
      {
        confirmButtonText: '加载',
        cancelButtonText: '取消',
        inputType: 'select',
        inputOptions: savedConnections.value.reduce((acc, conn, index) => {
          acc[index] = conn.name || `${conn.username}@${conn.host}`
          return acc
        }, {})
      }
    )
    
    const selected = savedConnections.value[parseInt(selectedIndex)]
    if (selected) {
      currentConnectionIndex.value = parseInt(selectedIndex)
      Object.assign(sshConfig.value, selected)
      ElMessage.success('配置已加载')
    }
  } catch {
    // 用户取消
  }
}

// 选择私钥文件
const selectPrivateKey = async () => {
  if (window.electronAPI) {
    try {
      const result = await window.electronAPI.dialog.openFile({
        title: '选择私钥文件',
        filters: [
          { name: '私钥文件', extensions: ['pem', 'key', 'rsa'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })
      
      if (result.success) {
        sshConfig.value.privateKeyPath = result.filePath
        ElMessage.success('私钥文件已选择')
      }
    } catch (error) {
      ElMessage.error('选择文件失败')
    }
  } else {
    ElMessage.info('私钥文件选择功能需要在 Electron 环境中使用')
  }
}

// 组件挂载和卸载
onMounted(() => {
  // 加载保存的连接列表
  loadSavedConnections()
  
  // 初始化默认配置
  const username = window.electronAPI?.system?.env?.USER || 'root'
  if (!sshConfig.value.username) {
    sshConfig.value.username = username
  }
  
  // 添加欢迎信息
  addTerminalLine({
    type: 'system',
    content: '🚀 MySSH 终端已启动',
    timestamp: new Date()
  })
  addTerminalLine({
    type: 'system', 
    content: savedConnections.value.length > 0 
      ? '请从上方列表选择连接，或点击"新建连接"按钮'
      : '请点击"新建连接"创建您的第一个SSH连接',
    timestamp: new Date()
  })
})

onUnmounted(() => {
  if (isConnected.value) {
    disconnectSSH()
  }
})
</script>

<style scoped>
.ssh-terminal {
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
}

.connections-list-card {
  flex-shrink: 0;
  max-height: 300px;
}

.connections-list {
  max-height: 240px;
  overflow-y: auto;
}

.empty-connections {
  padding: 20px;
  text-align: center;
}

.connection-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  background: #fff;
}

.connection-item:hover {
  background: #f5f7fa;
  border-color: #409eff;
  transform: translateX(4px);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.1);
}

.connection-item.active {
  border-color: #409eff;
  background: #ecf5ff;
  box-shadow: 0 2px 12px rgba(64, 158, 255, 0.2);
}

.connection-info {
  flex: 1;
  min-width: 0;
}

.connection-name {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 15px;
}

.connection-name .el-icon {
  color: #409eff;
  font-size: 18px;
}

.connection-details {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.connection-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  margin-left: 16px;
}

.connection-card {
  flex-shrink: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.ssh-form {
  margin-top: 16px;
}

.terminal-card {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.terminal-actions {
  display: flex;
  gap: 12px;
}

.terminal-container {
  background: #1a1a1a;
  color: #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Source Code Pro', monospace;
  font-size: 14px;
  line-height: 1.6;
  min-height: 400px;
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid #333;
  transition: all 0.3s ease;
}

.terminal-container.connected {
  border-color: #67c23a;
  box-shadow: 0 0 0 1px rgba(103, 194, 58, 0.2);
}

.terminal-output {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 16px;
  scrollbar-width: thin;
  scrollbar-color: #555 #2a2a2a;
}

.terminal-output::-webkit-scrollbar {
  width: 8px;
}

.terminal-output::-webkit-scrollbar-track {
  background: #2a2a2a;
}

.terminal-output::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}

.terminal-output::-webkit-scrollbar-thumb:hover {
  background: #777;
}

.terminal-welcome {
  text-align: center;
  padding: 40px 20px;
  color: #888;
  font-style: italic;
}

.terminal-welcome p {
  margin: 8px 0;
}

.terminal-line {
  margin-bottom: 4px;
  word-wrap: break-word;
  white-space: pre-wrap;
  animation: fadeIn 0.3s ease-in;
}

.terminal-line.command {
  color: #e0e0e0;
  font-weight: 500;
}

.terminal-line.output {
  color: #b0b0b0;
}

.terminal-line.error {
  color: #ff6b6b;
}

.terminal-line.system {
  color: #4fc3f7;
  font-weight: 500;
}

.command-prefix {
  color: #67c23a;
  font-weight: bold;
  margin-right: 4px;
}

.terminal-input-line {
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: 1px solid #333;
  padding-top: 12px;
}

.prompt {
  color: #67c23a;
  font-weight: bold;
  font-family: inherit;
  white-space: nowrap;
}

.command-input {
  flex: 1;
  background: transparent;
  border: none;
  color: #e0e0e0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  outline: none;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

.command-input:focus {
  background: rgba(255, 255, 255, 0.05);
}

.command-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.command-input::placeholder {
  color: #666;
}

.status-alert {
  margin-top: 16px;
  flex-shrink: 0;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .ssh-form {
    margin-top: 12px;
  }
  
  .terminal-container {
    font-size: 12px;
    padding: 12px;
  }
  
  .header-actions {
    flex-direction: column;
    gap: 8px;
  }
}

/* 深色主题优化 */
.el-card {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
}

@media (prefers-color-scheme: dark) {
  .el-card {
    background: #2d3748;
    border: 1px solid #4a5568;
  }
}

/* 连接状态指示器 */
.terminal-card :deep(.el-card__header) {
  position: relative;
}

.terminal-card :deep(.el-card__header)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 20px;
  background: #ccc;
  border-radius: 2px;
  transition: background-color 0.3s ease;
}

.terminal-container.connected + * :deep(.el-card__header)::before {
  background: #67c23a;
}
</style>
