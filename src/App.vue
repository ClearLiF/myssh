<template>
  <div id="app">
    <!-- 登录界面 -->
    <LoginRegister 
      v-if="!isAuthenticated && !skipLogin"
      @login-success="handleLoginSuccess"
      @skip-login="handleSkipLogin"
    />

    <!-- 主内容区域 -->
    <el-container v-if="isAuthenticated || skipLogin" class="main-container">
      <!-- 主标签页区域 -->
      <el-main class="tabs-content">
        <el-tabs
          v-model="activeTabName"
          type="card"
          @tab-remove="handleTabRemove"
          class="connection-tabs"
        >
          <!-- Hosts 固定标签页（不可关闭） -->
          <el-tab-pane
            name="hosts"
            :closable="false"
          >
            <template #label>
              <span class="hosts-tab-label">
                <el-icon><Monitor /></el-icon>
                Hosts
              </span>
            </template>
            <HostsList @open-connection="handleOpenConnection" @open-settings="handleOpenSettings" />
          </el-tab-pane>

          <!-- 其他动态标签页 -->
          <el-tab-pane
            v-for="tab in openTabs"
            :key="tab.name"
            :label="tab.label"
            :name="tab.name"
            :closable="true"
          >
            <ConnectionTab 
              v-if="!tab.type || tab.type === 'connection'"
              :connection="tab.connection" 
              :tab-id="tab.name"
              @open-sftp="handleOpenSFTP"
              @open-process-monitor="handleOpenProcessMonitor"
              @open-network-monitor="handleOpenNetworkMonitor"
              @open-docker-manager="handleOpenDockerManager"
              @open-systemctl-manager="handleOpenSystemctlManager"
            />
            <SFTPManagerTab
              v-else-if="tab.type === 'sftp'"
              :connection="tab.connection"
              :connection-id="tab.connectionId"
              :tab-mode="true"
            />
            <ProcessMonitorTab
              v-else-if="tab.type === 'process-monitor'"
              :connection="tab.connection"
              :connection-id="tab.connectionId"
            />
            <NetworkMonitorTab
              v-else-if="tab.type === 'network-monitor'"
              :connection="tab.connection"
              :connection-id="tab.connectionId"
            />
            <DockerManagerTab
              v-else-if="tab.type === 'docker-manager'"
              :connection="tab.connection"
              :connection-id="tab.connectionId"
            />
            <SystemctlManagerTab
              v-else-if="tab.type === 'systemctl-manager'"
              :connection="tab.connection"
              :connection-id="tab.connectionId"
            />
            <SettingsTab
              v-else-if="tab.type === 'settings'"
            />
          </el-tab-pane>
        </el-tabs>
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Monitor } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import LoginRegister from './components/LoginRegister.vue'
import HostsList from './components/HostsList.vue'
import ConnectionTab from './components/ConnectionTab.vue'
import SFTPManagerTab from './components/SFTPManagerTab.vue'
import SettingsTab from './components/SettingsTab.vue'
import ProcessMonitorTab from './components/ProcessMonitorTab.vue'
import NetworkMonitorTab from './components/NetworkMonitorTab.vue'
import DockerManagerTab from './components/DockerManagerTab.vue'
import SystemctlManagerTab from './components/SystemctlManagerTab.vue'
import { authAPI } from './services/api'

// 认证状态
const isAuthenticated = ref(false)
const skipLogin = ref(false) // 是否跳过登录

// 打开的标签页列表（不包含 Hosts）
const openTabs = ref([])
const activeTabName = ref('hosts') // 默认激活 Hosts 标签页
let tabIndex = 0

// 检查首次运行并设置保存路径
const checkFirstRun = async () => {
  try {
    if (!window.connectionAPI) {
      console.log('connectionAPI 不可用，跳过首次运行检查')
      return
    }

    const result = await window.connectionAPI.isFirstRun()
    
    if (result.success && result.isFirstRun) {
      console.log('检测到首次运行，提示用户选择保存位置')
      
      // 显示欢迎对话框
      await ElMessageBox.confirm(
        `欢迎使用 MySSH！\n\n首次运行需要设置 SSH 连接配置的保存位置。\n\n默认保存位置：\n${result.defaultPath}\n\n您可以选择默认位置，或者自定义保存位置。`,
        '首次运行设置',
        {
          confirmButtonText: '自定义位置',
          cancelButtonText: '使用默认位置',
          type: 'info',
          distinguishCancelAndClose: true,
          closeOnClickModal: false,
          closeOnPressEscape: false
        }
      ).then(async () => {
        // 用户选择自定义位置
        const pathResult = await window.connectionAPI.selectPath()
        if (pathResult.success) {
          ElMessage.success(`已设置保存位置：${pathResult.path}`)
        } else {
          ElMessage.warning('未选择路径，将使用默认位置')
        }
      }).catch(async (action) => {
        // 用户选择使用默认位置或关闭对话框
        if (action === 'cancel') {
          // 设置默认路径（其实不用手动设置，后端会自动使用默认路径）
          ElMessage.success(`已使用默认保存位置`)
          // 调用一次 setPath 来标记不再是首次运行
          await window.connectionAPI.setPath(result.defaultPath + '/connections')
        }
      })
    }
  } catch (error) {
    console.error('检查首次运行状态失败:', error)
  }
}

// 加载主题设置
const loadTheme = async () => {
  try {
    if (window.electronAPI && window.electronAPI.settings) {
      const result = await window.electronAPI.settings.getTheme()
      if (result.success) {
        const theme = result.theme || 'dark'
        applyTheme(theme)
      }
    }
  } catch (error) {
    console.error('加载主题设置失败:', error)
  }
}

// 应用主题
const applyTheme = (theme) => {
  const html = document.documentElement
  if (theme === 'light') {
    html.setAttribute('data-theme', 'light')
  } else {
    html.removeAttribute('data-theme')
  }
}

// 处理登录成功
const handleLoginSuccess = () => {
  isAuthenticated.value = true
  skipLogin.value = false
  ElMessage.success('欢迎回来！')
}

// 处理跳过登录
const handleSkipLogin = () => {
  skipLogin.value = true
  // 保存跳过登录的状态到 localStorage
  localStorage.setItem('skip_login', 'true')
}

// 处理登出
const handleLogout = () => {
  isAuthenticated.value = false
  skipLogin.value = false
  openTabs.value = []
  activeTabName.value = 'hosts'
  // 清除跳过登录的状态
  localStorage.removeItem('skip_login')
  ElMessage.info('已退出登录')
}

// 检查认证状态
const checkAuthStatus = () => {
  isAuthenticated.value = authAPI.isAuthenticated()
  // 检查是否之前跳过了登录
  if (!isAuthenticated.value) {
    const skipped = localStorage.getItem('skip_login')
    skipLogin.value = skipped === 'true'
  }
}

// 在组件挂载时加载主题和检查首次运行
onMounted(async () => {
  await loadTheme()
  
  // 检查认证状态
  checkAuthStatus()
  
  // 如果已登录或跳过登录，延迟检查首次运行
  if (isAuthenticated.value || skipLogin.value) {
    setTimeout(() => {
      checkFirstRun()
    }, 500)
  }

  // 监听登出事件
  window.addEventListener('auth:logout', handleLogout)
})

// 处理打开连接
const handleOpenConnection = (connection) => {
  // 每次都创建新标签页，允许对同一主机打开多个连接
  const newTabName = `tab-${++tabIndex}`
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  
  openTabs.value.push({
    name: newTabName,
    label: `${connection.name || connection.host} [${timestamp}]`,
    connection: connection
  })
  activeTabName.value = newTabName
}

// 处理关闭标签页
const handleTabRemove = (targetName) => {
  const tabs = openTabs.value
  let activeName = activeTabName.value
  
  if (activeName === targetName) {
    tabs.forEach((tab, index) => {
      if (tab.name === targetName) {
        const nextTab = tabs[index + 1] || tabs[index - 1]
        if (nextTab) {
          activeName = nextTab.name
        }
      }
    })
  }
  
  activeTabName.value = activeName
  openTabs.value = tabs.filter(tab => tab.name !== targetName)
}

// 处理打开 SFTP 文件管理器
const handleOpenSFTP = ({ connection, connectionId }) => {
  const newTabName = `sftp-${++tabIndex}`
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  
  openTabs.value.push({
    name: newTabName,
    label: `📁 ${connection.name || connection.host} [${timestamp}]`,
    connection: connection,
    connectionId: connectionId,
    type: 'sftp'  // 标记为 SFTP 标签页
  })
  activeTabName.value = newTabName
}

// 处理打开进程监控
const handleOpenProcessMonitor = ({ connection, connectionId }) => {
  const newTabName = `process-${++tabIndex}`
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  
  openTabs.value.push({
    name: newTabName,
    label: `📊 进程 - ${connection.name || connection.host}`,
    connection: connection,
    connectionId: connectionId,
    type: 'process-monitor'  // 标记为进程监控标签页
  })
  activeTabName.value = newTabName
}

// 处理打开网络监控
const handleOpenNetworkMonitor = ({ connection, connectionId }) => {
  const newTabName = `network-${++tabIndex}`
  
  openTabs.value.push({
    name: newTabName,
    label: `🌐 网络 - ${connection.name || connection.host}`,
    connection: connection,
    connectionId: connectionId,
    type: 'network-monitor'  // 标记为网络监控标签页
  })
  activeTabName.value = newTabName
}

// 处理打开 Docker 管理
const handleOpenDockerManager = ({ connection, connectionId }) => {
  const newTabName = `docker-${++tabIndex}`
  
  openTabs.value.push({
    name: newTabName,
    label: `🐳 Docker - ${connection.name || connection.host}`,
    connection: connection,
    connectionId: connectionId,
    type: 'docker-manager'  // 标记为 Docker 管理标签页
  })
  activeTabName.value = newTabName
}

// 处理打开 Systemctl 管理
const handleOpenSystemctlManager = ({ connection, connectionId }) => {
  const newTabName = `systemctl-${++tabIndex}`
  
  openTabs.value.push({
    name: newTabName,
    label: `⚙️ Systemctl - ${connection.name || connection.host}`,
    connection: connection,
    connectionId: connectionId,
    type: 'systemctl-manager'  // 标记为 Systemctl 管理标签页
  })
  activeTabName.value = newTabName
}

// 处理打开设置
const handleOpenSettings = () => {
  const newTabName = `settings-${++tabIndex}`
  
  openTabs.value.push({
    name: newTabName,
    label: '⚙️ 设置',
    type: 'settings'  // 标记为设置标签页
  })
  activeTabName.value = newTabName
}

// 暴露主题管理函数供 SettingsTab 使用
window.__app = {
  loadTheme,
  applyTheme
}
</script>

<style scoped>
#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
  transition: background-color 0.3s ease;
}

.main-container {
  flex: 1;
  height: 100vh;
  overflow: hidden;
}


.tabs-content {
  padding: 0;
  background: var(--bg-primary);
  overflow: hidden;
  transition: background-color 0.3s ease;
}

.connection-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.connection-tabs :deep(.el-tabs__header) {
  margin: 0;
  background: var(--bg-secondary);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border-color);
  box-shadow: 0 2px 8px var(--shadow-color);
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.connection-tabs :deep(.el-tabs__nav-wrap)::after {
  display: none;
}

.connection-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
  padding: 0;
}

.connection-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: hidden;
}

.connection-tabs :deep(.el-tabs__item) {
  color: var(--text-secondary);
  border: none;
  background: transparent;
  font-weight: 500;
  font-size: 12px;
  transition: all 0.3s;
  padding: 0 16px;
  height: 34px;
  line-height: 34px;
}

.connection-tabs :deep(.el-tabs__item:hover) {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.03);
}

.connection-tabs :deep(.el-tabs__item.is-active) {
  color: var(--text-primary);
  background: rgba(102, 126, 234, 0.15);
  border-bottom: 2px solid;
  border-image: linear-gradient(90deg, #667eea 0%, #764ba2 100%) 1;
}

.connection-tabs :deep(.el-tabs__item .el-icon-close) {
  transition: all 0.2s;
}

.connection-tabs :deep(.el-tabs__item .el-icon-close:hover) {
  background: rgba(255, 255, 255, 0.1);
  color: #ff7b72;
}

/* Hosts 标签页标签样式 */
.hosts-tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.hosts-tab-label .el-icon {
  font-size: 14px;
}
</style>
