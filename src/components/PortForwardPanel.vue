<template>
  <div class="port-forward-panel">
    <div class="panel-header">
      <div class="header-left">
        <el-icon class="header-icon"><Connection /></el-icon>
        <span class="panel-title">端口转发</span>
      </div>
      <el-badge
        v-if="tunnels.length > 0"
        :value="tunnels.length"
        :max="99"
        class="tunnel-count"
      />
    </div>

    <div class="tunnels-list">
      <!-- 无端口转发时的提示 -->
      <div v-if="!tunnels || tunnels.length === 0" class="empty-state">
        <el-icon class="empty-icon"><Connection /></el-icon>
        <p class="empty-text">暂无端口转发</p>
      </div>

      <!-- 端口转发列表 -->
      <div v-else class="tunnel-items">
        <div
          v-for="(tunnel, index) in tunnels"
          :key="index"
          class="tunnel-item"
        >
          <div class="tunnel-header">
            <span
              class="status-dot"
              :class="{
                'status-connected': tunnel.isConnected,
                'status-disconnected': !tunnel.isConnected,
                'status-checking': tunnel.checking,
                'status-starting': tunnel.starting,
                'status-stopping': tunnel.stopping
              }"
              :title="getTunnelStatusText(tunnel)"
            ></span>
            <span class="tunnel-name">{{ tunnel.name }}</span>
            <span class="tunnel-type">{{ tunnel.type === 'local' ? 'L' : 'R' }}</span>
          </div>

          <div class="tunnel-info">
            <div class="info-row">
              <span class="info-label">监听</span>
              <span class="info-value">{{ tunnel.listenHost }}:{{ tunnel.listenPort }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">目标</span>
              <span class="info-value">{{ tunnel.targetHost }}:{{ tunnel.targetPort }}</span>
            </div>
          </div>

          <div class="tunnel-footer">
            <span class="connection-status">
              <template v-if="tunnel.starting">
                <el-icon class="is-loading"><Loading /></el-icon>
                <span class="status-text">启动中...</span>
              </template>
              <template v-else-if="tunnel.stopping">
                <el-icon class="is-loading"><Loading /></el-icon>
                <span class="status-text">关闭中...</span>
              </template>
              <template v-else-if="tunnel.checking">
                <el-icon class="is-loading"><Loading /></el-icon>
                <span class="status-text">检测中...</span>
              </template>
              <template v-else-if="tunnel.isConnected">
                <span class="status-text status-success">● 已连接</span>
              </template>
              <template v-else>
                <span class="status-text status-error">○ 未连接</span>
              </template>
            </span>
            <div class="tunnel-actions">
              <el-button
                v-if="tunnel.isConnected"
                size="small"
                type="danger"
                text
                @click="stopTunnel(tunnel)"
                :loading="tunnel.stopping"
                :disabled="tunnel.starting || tunnel.checking"
              >
                关闭
              </el-button>
              <el-button
                v-else
                size="small"
                type="primary"
                text
                @click="startTunnel(tunnel)"
                :loading="tunnel.starting"
                :disabled="tunnel.stopping || tunnel.checking"
              >
                启动
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 刷新和保存按钮 -->
    <div v-if="tunnels && tunnels.length > 0" class="panel-footer">
      <el-button
        text
        size="small"
        @click="checkAllTunnels"
        :loading="isCheckingAll"
        class="refresh-btn"
      >
        <el-icon><Refresh /></el-icon>
        <span>刷新状态</span>
      </el-button>
      <el-button
        v-if="connection"
        type="primary"
        size="small"
        @click="saveTunnelsToConfig"
        :loading="isSaving"
        class="save-btn"
        title="将当前端口转发配置保存到主机配置中"
      >
        <el-icon><DocumentCopy /></el-icon>
        <span>保存到配置</span>
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Connection,
  Refresh,
  Loading,
  DocumentCopy
} from '@element-plus/icons-vue'
import { sshListAPI, authAPI } from '../services/api'

const props = defineProps({
  connectionId: {
    type: String,
    required: true
  },
  connection: {
    type: Object,
    default: null
  }
})

const tunnels = ref([])
const isCheckingAll = ref(false)
const isSaving = ref(false)
let checkInterval = null

// 获取端口转发列表
const loadTunnels = async () => {
  if (!window.electronAPI || !props.connectionId) return

  try {
    const result = await window.electronAPI.ssh.getTunnels(props.connectionId)
    if (result.success && result.tunnels) {
      tunnels.value = result.tunnels.map(t => ({
        ...t,
        isConnected: false,
        checking: false,
        starting: false,
        stopping: false
      }))

      // 自动检测所有隧道状态
      await checkAllTunnels()
    }
  } catch (error) {
    console.error('获取端口转发列表失败:', error)
  }
}

// 检查单个隧道状态
const checkTunnelStatus = async (tunnel) => {
  if (!window.electronAPI) return

  tunnel.checking = true

  try {
    const result = await window.electronAPI.ssh.checkTunnelStatus(
      props.connectionId,
      tunnel.listenHost,
      tunnel.listenPort
    )

    tunnel.isConnected = result.success && result.isConnected
  } catch (error) {
    console.error('检查隧道状态失败:', error)
    tunnel.isConnected = false
  } finally {
    tunnel.checking = false
  }
}

// 检查所有隧道状态
const checkAllTunnels = async () => {
  isCheckingAll.value = true

  try {
    // 并行检查所有隧道
    await Promise.all(tunnels.value.map(tunnel => checkTunnelStatus(tunnel)))
  } finally {
    isCheckingAll.value = false
  }
}

// 手动启动隧道
const startTunnel = async (tunnel) => {
  if (!window.electronAPI) return

  tunnel.starting = true

  try {
    const result = await window.electronAPI.ssh.startTunnel(
      props.connectionId,
      {
        name: tunnel.name,
        type: tunnel.type,
        listenHost: tunnel.listenHost,
        listenPort: tunnel.listenPort,
        targetHost: tunnel.targetHost,
        targetPort: tunnel.targetPort
      }
    )

    if (result.success) {
      ElMessage.success(`端口转发 "${tunnel.name}" 已启动`)
      tunnel.isConnected = true
      // 启动后立即检查状态
      await checkTunnelStatus(tunnel)
    } else {
      ElMessage.error(result.message || '启动失败')
      tunnel.isConnected = false
    }
  } catch (error) {
    console.error('启动隧道失败:', error)
    ElMessage.error('启动失败: ' + error.message)
    tunnel.isConnected = false
  } finally {
    tunnel.starting = false
  }
}

// 手动停止隧道
const stopTunnel = async (tunnel) => {
  if (!window.electronAPI) return

  tunnel.stopping = true

  try {
    const result = await window.electronAPI.ssh.stopTunnel(
      props.connectionId,
      tunnel.listenHost,
      tunnel.listenPort
    )

    if (result.success) {
      ElMessage.success(`端口转发 "${tunnel.name}" 已关闭`)
      tunnel.isConnected = false
    } else {
      ElMessage.error(result.message || '关闭失败')
    }
  } catch (error) {
    console.error('停止隧道失败:', error)
    ElMessage.error('关闭失败: ' + error.message)
  } finally {
    tunnel.stopping = false
  }
}

// 获取隧道状态文本
const getTunnelStatusText = (tunnel) => {
  if (tunnel.starting) return '启动中...'
  if (tunnel.stopping) return '关闭中...'
  if (tunnel.checking) return '检测中...'
  if (tunnel.isConnected) return '已连接'
  return '未连接'
}

// 保存端口转发配置到主机配置
const saveTunnelsToConfig = async () => {
  if (!props.connection) {
    ElMessage.warning('无法保存：缺少主机配置信息')
    return
  }

  isSaving.value = true

  try {
    // 清理隧道列表，移除运行时状态
    const cleanTunnels = tunnels.value.map(t => ({
      name: t.name,
      type: t.type,
      listenHost: t.listenHost,
      listenPort: t.listenPort,
      targetHost: t.targetHost,
      targetPort: t.targetPort
    }))

    console.log('💾 保存端口转发到主机配置:')
    console.log('  - 主机:', props.connection.name)
    console.log('  - 端口转发数量:', cleanTunnels.length)
    console.log('  - 配置:', cleanTunnels)

    // 准备更新的主机配置
    const updatedConnection = {
      ...props.connection,
      tunnels: cleanTunnels
    }

    // 准备 otherInfo
    const otherInfo = {
      portForwarding: cleanTunnels
    }

    const serializedHost = {
      id: updatedConnection.id,
      name: updatedConnection.name,
      host: updatedConnection.host,
      port: updatedConnection.port,
      username: updatedConnection.username,
      authType: updatedConnection.authType,
      password: updatedConnection.password,
      privateKeyContent: updatedConnection.privateKeyContent,
      privateKeyPassphrase: updatedConnection.privateKeyPassphrase,
      group: updatedConnection.group,
      otherInfo: JSON.stringify(otherInfo)
    }

    // 保存到云端或本地
    let saved = false

    // 尝试云端保存
    if (authAPI.isAuthenticated() && updatedConnection.id) {
      console.log('  → 云端：更新主机 ID:', updatedConnection.id)
      const result = await sshListAPI.update(updatedConnection.id, serializedHost)
      if (result.success) {
        console.log('  ✅ 云端保存成功')
        ElMessage.success('端口转发配置已保存到云端')
        saved = true
      } else {
        console.warn('  ❌ 云端保存失败:', result.error)
      }
    }

    // 如果云端保存失败或没有登录，尝试本地保存
    if (!saved && window.connectionAPI) {
      console.log('  → 本地：保存配置')
      
      // 需要加载整个主机列表
      const loadResult = await window.connectionAPI.loadConnections()
      if (loadResult.success) {
        const connections = loadResult.connections || []
        
        // 找到当前主机并更新
        const index = connections.findIndex(c => 
          c.host === updatedConnection.host && 
          c.port === updatedConnection.port &&
          c.username === updatedConnection.username
        )
        
        if (index >= 0) {
          connections[index] = serializedHost
          
          // 保存整个列表
          const saveResult = await window.connectionAPI.saveConnections(connections)
          if (saveResult.success) {
            console.log('  ✅ 本地保存成功')
            ElMessage.success('端口转发配置已保存到本地')
            saved = true
          } else {
            console.error('  ❌ 本地保存失败:', saveResult.message)
          }
        } else {
          console.warn('  ⚠️ 未找到匹配的主机配置')
          ElMessage.warning('未找到对应的主机配置')
        }
      }
    }

    if (!saved) {
      ElMessage.error('保存失败，请检查日志')
    }
  } catch (error) {
    console.error('保存端口转发配置失败:', error)
    ElMessage.error('保存失败: ' + error.message)
  } finally {
    isSaving.value = false
  }
}

// 监听connectionId变化
watch(() => props.connectionId, () => {
  loadTunnels()
}, { immediate: true })

onMounted(() => {
  loadTunnels()

  // 每30秒自动刷新一次状态
  checkInterval = setInterval(() => {
    if (tunnels.value.length > 0) {
      checkAllTunnels()
    }
  }, 30000)
})

onUnmounted(() => {
  if (checkInterval) {
    clearInterval(checkInterval)
  }
})
</script>

<style scoped>
.port-forward-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--bg-secondary);
  overflow: hidden;
  box-sizing: border-box;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
  flex-shrink: 0;
  box-sizing: border-box;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  font-size: 14px;
  color: var(--accent-color);
}

.panel-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tunnel-count :deep(.el-badge__content) {
  background: var(--accent-color);
  color: #ffffff;
  font-size: 10px;
  height: 16px;
  line-height: 16px;
  padding: 0 5px;
  border: none;
  font-weight: 600;
}

.tunnels-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
}

.tunnels-list::-webkit-scrollbar {
  width: 4px;
}

.tunnels-list::-webkit-scrollbar-track {
  background: transparent;
}

.tunnels-list::-webkit-scrollbar-thumb {
  background: rgba(139, 233, 253, 0.2);
  border-radius: 2px;
}

.tunnels-list::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 233, 253, 0.3);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
  height: 100%;
  min-height: 150px;
}

.empty-icon {
  font-size: 40px;
  color: var(--accent-color);
  opacity: 0.3;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 11px;
  color: var(--text-tertiary);
  margin: 0;
}

/* 隧道列表项 */
.tunnel-items {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tunnel-item {
  background: var(--card-bg);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  padding: 12px;
  transition: all 0.3s ease;
}

.tunnel-item:hover {
  border-color: var(--accent-color);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.tunnel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-connected {
  background: #67c23a;
  box-shadow: 0 0 6px rgba(103, 194, 58, 0.6);
  animation: pulse-green 2s ease-in-out infinite;
}

.status-disconnected {
  background: var(--text-tertiary);
  opacity: 0.5;
}

.status-checking,
.status-starting,
.status-stopping {
  background: #e6a23c;
  box-shadow: 0 0 6px rgba(230, 162, 60, 0.6);
  animation: pulse-yellow 1.5s ease-in-out infinite;
}

@keyframes pulse-green {
  0%, 100% {
    opacity: 1;
    box-shadow: 0 0 6px rgba(103, 194, 58, 0.6);
  }
  50% {
    opacity: 0.7;
    box-shadow: 0 0 10px rgba(103, 194, 58, 0.8);
  }
}

@keyframes pulse-yellow {
  0%, 100% {
    opacity: 1;
    box-shadow: 0 0 6px rgba(230, 162, 60, 0.6);
  }
  50% {
    opacity: 0.7;
    box-shadow: 0 0 10px rgba(230, 162, 60, 0.8);
  }
}

.tunnel-name {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tunnel-type {
  font-size: 9px;
  font-weight: 600;
  color: var(--accent-color);
  background: rgba(102, 126, 234, 0.15);
  padding: 2px 6px;
  border-radius: 3px;
  line-height: 1;
  border: 1px solid rgba(102, 126, 234, 0.25);
}

.tunnel-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 10px;
  padding-left: 16px;
}

.info-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-label {
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  color: var(--text-primary);
  font-family: 'Cascadia Code', 'JetBrains Mono', 'Consolas', monospace;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.info-arrow {
  display: none;
}

.tunnel-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color-light);
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-family: 'Cascadia Code', monospace;
}

.status-text {
  color: var(--text-secondary);
  font-weight: 600;
}

.status-success {
  color: #67c23a;
}

.status-error {
  color: var(--text-tertiary);
}

.is-loading {
  color: var(--accent-color);
  font-size: 12px;
}

.tunnel-actions {
  display: flex;
  gap: 4px;
}

.tunnel-actions .el-button {
  font-size: 10px;
  padding: 4px 8px;
  height: auto;
}

.tunnel-actions .el-button--primary {
  color: var(--accent-color);
  font-weight: 600;
}

.tunnel-actions .el-button--primary:hover {
  background: rgba(102, 126, 234, 0.1);
}

.tunnel-actions .el-button--danger {
  color: #000000;
  font-weight: 600;
}

.tunnel-actions .el-button--danger:hover {
  color: #262626;
  background: rgba(245, 108, 108, 0.1);
}

.panel-footer {
  padding: 8px 12px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  box-sizing: border-box;
}

.refresh-btn {
  color: var(--accent-color);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 12px;
  transition: all 0.3s ease;
}

.refresh-btn:hover {
  background: rgba(102, 126, 234, 0.1);
}

.refresh-btn .el-icon {
  margin-right: 4px;
  font-size: 12px;
}

.save-btn {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 12px;
}

.save-btn .el-icon {
  margin-right: 4px;
  font-size: 12px;
}
</style>

