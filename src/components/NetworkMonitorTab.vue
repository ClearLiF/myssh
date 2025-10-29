<template>
  <div class="network-monitor-tab">
    <div class="toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索进程名、端口..."
          size="small"
          clearable
          style="width: 250px"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        
        <el-select v-model="filterProtocol" size="small" style="width: 120px; margin-left: 10px">
          <el-option label="全部协议" value="all" />
          <el-option label="TCP" value="tcp" />
          <el-option label="UDP" value="udp" />
        </el-select>
        
        <el-tooltip placement="top" effect="light">
          <template #content>
            <div style="max-width: 300px; line-height: 1.6;">
              <strong>流量统计说明：</strong><br />
              <span v-if="nethogsInstalled" style="color: #67c23a;">
                ✅ 使用 nethogs 获取纯网络流量<br />
              </span>
              <span v-else style="color: #e6a23c;">
                ⚠️ 使用 /proc/&lt;pid&gt;/io（包含文件IO）<br />
              </span>
              • <strong>上传/下载速率</strong>：实时速率（KB/s, MB/s）<br />
              • <strong>总上传/下载</strong>：进程启动以来的累计流量<br />
              • 自动刷新间隔：2秒
            </div>
          </template>
          <el-icon style="margin-left: 10px; color: var(--el-color-info); cursor: help" :size="16">
            <QuestionFilled />
          </el-icon>
        </el-tooltip>
      </div>
      
      <div class="toolbar-right">
        <!-- nethogs 状态指示 -->
        <div v-if="!checkingNethogs" class="nethogs-status">
          <el-tag v-if="nethogsInstalled" type="success" size="small" effect="dark">
            <el-icon><SuccessFilled /></el-icon>
            nethogs 已安装
          </el-tag>
          <el-button 
            v-else 
            type="warning" 
            size="small" 
            @click="installNethogs"
            :loading="installingNethogs"
          >
            <el-icon><Download /></el-icon>
            安装 nethogs（更准确）
          </el-button>
        </div>
        
        <el-divider direction="vertical" />
        
        <el-switch
          v-model="autoRefresh"
          active-text="自动刷新"
          size="small"
          style="margin-right: 10px"
        />
        <el-button size="small" @click="refreshData" :loading="loading">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <div class="content-container" :class="{ 'has-detail': selectedProcess }">
      <!-- 进程列表表格 -->
      <div class="process-table-container">
        <el-table
          :data="filteredProcesses"
          stripe
          :height="tableHeight"
          style="width: 100%"
          :default-sort="{ prop: 'ipCount', order: 'descending' }"
          @row-click="handleRowClick"
          :row-class-name="getRowClassName"
          highlight-current-row
        >
          <el-table-column prop="pid" label="PID" width="80" sortable />
          <el-table-column prop="processName" label="进程名" width="200" sortable show-overflow-tooltip />
          <el-table-column prop="protocol" label="协议" width="100" sortable>
            <template #default="scope">
              <el-tag :type="scope.row.protocol === 'TCP' ? 'primary' : 'success'" size="small">
                {{ scope.row.protocol }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="localPort" label="本地端口" width="120" sortable show-overflow-tooltip />
          <el-table-column prop="ipCount" label="IP数" width="100" sortable align="center">
            <template #default="scope">
              <span class="ip-count">{{ scope.row.ipCount }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="connectionCount" label="连接数" width="100" sortable align="center" />
          <el-table-column prop="listenCount" label="监听数" width="100" sortable align="center" />
          <el-table-column prop="establishedCount" label="已建立" width="100" sortable align="center" />
          <el-table-column prop="uploadSpeed" label="上传速率" width="130" sortable>
            <template #default="scope">
              <span style="color: var(--el-color-warning); font-weight: 600;">
                {{ formatSpeed(scope.row.uploadSpeed) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="downloadSpeed" label="下载速率" width="130" sortable>
            <template #default="scope">
              <span style="color: var(--el-color-success); font-weight: 600;">
                {{ formatSpeed(scope.row.downloadSpeed) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="totalUpload" label="总上传" width="120" sortable>
            <template #default="scope">
              <span style="color: var(--text-secondary); font-size: 12px;">
                {{ formatBytes(scope.row.totalUpload) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="totalDownload" label="总下载" width="120" sortable>
            <template #default="scope">
              <span style="color: var(--text-secondary); font-size: 12px;">
                {{ formatBytes(scope.row.totalDownload) }}
              </span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 连接详情面板 -->
      <div v-if="selectedProcess" class="detail-panel">
        <div class="detail-panel-header">
          <div class="detail-panel-title">
            <el-icon :size="18"><Connection /></el-icon>
            <span>{{ selectedProcess.processName }} (PID: {{ selectedProcess.pid }}) - 连接详情</span>
          </div>
          <el-button size="small" text @click="closeDetail">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
        
        <div class="detail-panel-content">
          <el-table
            :data="selectedProcess.connections"
            stripe
            max-height="300"
            style="width: 100%"
          >
            <el-table-column prop="localAddress" label="本地IP" width="150" show-overflow-tooltip />
            <el-table-column prop="localPort" label="本地端口" width="100" />
            <el-table-column prop="remoteAddress" label="远程IP" width="150" show-overflow-tooltip />
            <el-table-column prop="remotePort" label="远程端口" width="100" />
            <el-table-column prop="state" label="状态" width="120">
              <template #default="scope">
                <el-tag :type="getStateType(scope.row.state)" size="small">
                  {{ scope.row.state }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="接收/发送" min-width="150">
              <template #default="scope">
                <span style="color: var(--el-color-success)">↓ {{ formatBytes(scope.row.rxBytes || 0) }}</span>
                <span style="margin: 0 8px">/</span>
                <span style="color: var(--el-color-warning)">↑ {{ formatBytes(scope.row.txBytes || 0) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Connection, Close, QuestionFilled, SuccessFilled, Download } from '@element-plus/icons-vue'

const props = defineProps({
  connection: {
    type: Object,
    required: true
  },
  connectionId: {
    type: [String, Number],
    required: true
  }
})

const searchKeyword = ref('')
const filterProtocol = ref('all')
const autoRefresh = ref(true)
const loading = ref(false)
const rawConnections = ref([])
const selectedProcess = ref(null)

// nethogs 相关状态
const nethogsInstalled = ref(false)
const checkingNethogs = ref(true)
const installingNethogs = ref(false)

// 用于计算速率的历史数据
const lastTrafficData = ref(new Map()) // key: pid-protocol-port, value: { rxBytes, txBytes, timestamp }

// 存储每个连接的元数据（是否来自 nethogs 等）
const connectionMetadata = ref(new Map()) // key: pid, value: { isRealtime, ... }

let refreshTimer = null

// 计算表格高度
const tableHeight = computed(() => {
  return selectedProcess.value ? 'calc(100vh - 480px)' : 'calc(100vh - 180px)'
})

// 按进程分组统计（带实时速率计算）
const processGroups = computed(() => {
  const groups = {}
  const now = Date.now()
  
  rawConnections.value.forEach(conn => {
    // 使用 PID + 协议 + 本地端口 作为分组键
    const key = `${conn.pid}-${conn.protocol}-${conn.localPort || 'all'}`
    
    if (!groups[key]) {
      groups[key] = {
        pid: conn.pid,
        processName: conn.processName,
        protocol: conn.protocol,
        localPort: conn.localPort || '-',
        connections: [],
        uniqueIPs: new Set(),
        connectionCount: 0,
        listenCount: 0,
        establishedCount: 0,
        totalUpload: 0,
        totalDownload: 0,
        uploadSpeed: 0,    // 实时上传速率
        downloadSpeed: 0   // 实时下载速率
      }
    }
    
    groups[key].connections.push(conn)
    groups[key].connectionCount++
    
    // 统计唯一IP（远程IP）
    if (conn.remoteAddress && conn.remoteAddress !== '-' && conn.remoteAddress !== '0.0.0.0' && conn.remoteAddress !== '*') {
      groups[key].uniqueIPs.add(conn.remoteAddress)
    }
    
    // 统计状态
    if (conn.state === 'LISTEN') {
      groups[key].listenCount++
    } else if (conn.state === 'ESTABLISHED' || conn.state === 'ESTAB') {
      groups[key].establishedCount++
    }
    
    // 累加流量数据
    groups[key].totalUpload += conn.txBytes || 0
    groups[key].totalDownload += conn.rxBytes || 0
  })
  
  // 转换为数组并计算速率
  return Object.values(groups).map(group => {
    const key = `${group.pid}-${group.protocol}-${group.localPort}`
    const pidKey = `${group.pid}`
    let uploadSpeed = 0
    let downloadSpeed = 0
    
    // 检查是否是 nethogs 实时数据
    const metadata = connectionMetadata.value.get(pidKey)
    const isRealtime = metadata && metadata.isRealtime
    
    if (isRealtime) {
      // nethogs 数据：totalUpload/totalDownload 已经是速率（bytes/sec）
      uploadSpeed = group.totalUpload || 0
      downloadSpeed = group.totalDownload || 0
      
      // 对于 nethogs，我们需要累积估算总量
      const lastData = lastTrafficData.value.get(key)
      if (lastData) {
        const timeDiff = (now - lastData.timestamp) / 1000 // 秒
        if (timeDiff > 0) {
          // 累积 = 上次累积 + (本次速率 * 时间差)
          group.totalUpload = (lastData.cumulativeTx || 0) + (uploadSpeed * timeDiff)
          group.totalDownload = (lastData.cumulativeRx || 0) + (downloadSpeed * timeDiff)
        }
      } else {
        // 首次数据，累积值为 0
        group.totalUpload = 0
        group.totalDownload = 0
      }
      
      // 更新历史数据（保存累积值）
      lastTrafficData.value.set(key, {
        cumulativeTx: group.totalUpload,
        cumulativeRx: group.totalDownload,
        timestamp: now
      })
    } else {
      // /proc/pid/io 数据：totalUpload/totalDownload 是累积值
      const lastData = lastTrafficData.value.get(key)
      if (lastData) {
        const timeDiff = (now - lastData.timestamp) / 1000 // 转换为秒
        if (timeDiff > 0) {
          const uploadDiff = group.totalUpload - lastData.txBytes
          const downloadDiff = group.totalDownload - lastData.rxBytes
          
          // 只有当差值为正时才计算速率（防止进程重启导致的负值）
          uploadSpeed = uploadDiff > 0 ? uploadDiff / timeDiff : 0
          downloadSpeed = downloadDiff > 0 ? downloadDiff / timeDiff : 0
        }
      }
      
      // 更新历史数据
      lastTrafficData.value.set(key, {
        txBytes: group.totalUpload,
        rxBytes: group.totalDownload,
        timestamp: now
      })
    }
    
    return {
      ...group,
      ipCount: group.uniqueIPs.size,
      uploadSpeed: uploadSpeed,
      downloadSpeed: downloadSpeed,
      uniqueIPs: undefined // 移除Set对象
    }
  })
})

// 过滤进程列表
const filteredProcesses = computed(() => {
  let result = processGroups.value

  // 搜索过滤
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    result = result.filter(proc => 
      proc.processName.toLowerCase().includes(keyword) ||
      proc.pid.toString().includes(keyword) ||
      proc.localPort.toString().includes(keyword)
    )
  }

  // 协议过滤
  if (filterProtocol.value !== 'all') {
    result = result.filter(proc => proc.protocol.toLowerCase() === filterProtocol.value)
  }

  return result
})

// 获取状态类型
const getStateType = (state) => {
  if (state === 'LISTEN') return 'success'
  if (state === 'ESTABLISHED') return 'primary'
  if (state === 'TIME_WAIT' || state === 'CLOSE_WAIT') return 'warning'
  return 'info'
}

// 格式化字节数
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// 格式化速率（字节/秒）
const formatSpeed = (bytesPerSecond) => {
  if (bytesPerSecond === 0) return '0 B/s'
  const k = 1024
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k))
  return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 点击行展开详情
const handleRowClick = (row) => {
  if (selectedProcess.value && selectedProcess.value.pid === row.pid && selectedProcess.value.localPort === row.localPort) {
    // 如果点击的是同一行，则关闭
    selectedProcess.value = null
  } else {
    selectedProcess.value = row
  }
}

// 关闭详情面板
const closeDetail = () => {
  selectedProcess.value = null
}

// 清理历史数据（防止内存泄漏）
const cleanupOldData = () => {
  const currentKeys = new Set()
  processGroups.value.forEach(group => {
    const key = `${group.pid}-${group.protocol}-${group.localPort}`
    currentKeys.add(key)
  })
  
  // 删除不再存在的进程数据
  for (const key of lastTrafficData.value.keys()) {
    if (!currentKeys.has(key)) {
      lastTrafficData.value.delete(key)
    }
  }
}

// 获取行类名
const getRowClassName = ({ row }) => {
  if (selectedProcess.value && selectedProcess.value.pid === row.pid && selectedProcess.value.localPort === row.localPort) {
    return 'selected-row'
  }
  return ''
}

// 获取网络连接数据
const fetchNetworkConnections = async () => {
  if (!window.electronAPI || !props.connectionId) return
  
  loading.value = true
  try {
    const result = await window.electronAPI.ssh.getNetworkConnections(props.connectionId)
    if (result.success && result.connections) {
      rawConnections.value = result.connections
      
      // 更新连接元数据（检测是否使用 nethogs）
      if (result.connections && result.connections.length > 0) {
        result.connections.forEach(conn => {
          if (conn.pid) {
            const pidKey = `${conn.pid}`
            // 检查是否有 isRealtime 标志（来自 nethogs）
            if (conn.isRealtime !== undefined) {
              connectionMetadata.value.set(pidKey, {
                isRealtime: conn.isRealtime
              })
            }
          }
        })
      }
      
      // 调试：显示前几个连接的流量数据
      console.log('📊 网络连接数据示例:', result.connections.slice(0, 3).map(c => ({
        pid: c.pid,
        name: c.processName,
        rxBytes: c.rxBytes,
        txBytes: c.txBytes,
        isRealtime: c.isRealtime
      })))
      console.log('📊 连接元数据:', Array.from(connectionMetadata.value.entries()))
      
      // 触发 computed 计算后清理旧数据
      setTimeout(() => {
        cleanupOldData()
      }, 100)
    }
  } catch (error) {
    console.error('获取网络连接失败:', error)
  } finally {
    loading.value = false
  }
}

// 刷新数据
const refreshData = () => {
  fetchNetworkConnections()
}

// 检查 nethogs 是否安装
const checkNethogs = async () => {
  if (!window.electronAPI || !props.connectionId) return
  
  checkingNethogs.value = true
  try {
    const result = await window.electronAPI.ssh.checkNethogs(props.connectionId)
    nethogsInstalled.value = result.installed || false
    console.log('nethogs 安装状态:', nethogsInstalled.value)
  } catch (error) {
    console.error('检查 nethogs 失败:', error)
    nethogsInstalled.value = false
  } finally {
    checkingNethogs.value = false
  }
}

// 安装 nethogs
const installNethogs = async () => {
  try {
    const confirmed = await ElMessageBox.confirm(
      '将执行命令: apt-get update && apt-get install -y nethogs\n需要 root 权限，是否继续？',
      '安装 nethogs',
      {
        confirmButtonText: '安装',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    if (!confirmed) return
    
    installingNethogs.value = true
    ElMessage.info('正在安装 nethogs，请稍候...')
    
    const result = await window.electronAPI.ssh.installNethogs(props.connectionId)
    
    if (result.success) {
      ElMessage.success('nethogs 安装成功！')
      nethogsInstalled.value = true
      // 重新获取数据
      fetchNetworkConnections()
    } else {
      ElMessage.error(`安装失败: ${result.message}`)
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('安装 nethogs 失败: ' + error.message)
    }
  } finally {
    installingNethogs.value = false
  }
}

onMounted(async () => {
  // 检查 nethogs
  await checkNethogs()
  
  // 立即获取数据
  fetchNetworkConnections()
  
  // 自动刷新（每2秒）
  refreshTimer = setInterval(() => {
    if (autoRefresh.value) {
      fetchNetworkConnections()
    }
  }, 2000)
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
})
</script>

<style scoped>
.network-monitor-tab {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  padding: 16px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color-light);
}

.toolbar-left {
  display: flex;
  align-items: center;
}

.toolbar-right {
  display: flex;
  align-items: center;
}

.content-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.content-container.has-detail {
  gap: 16px;
}

.process-table-container {
  flex: 1;
  min-height: 200px;
}

/* IP数高亮 */
.ip-count {
  font-weight: 600;
  color: var(--accent-color);
  font-size: 14px;
}

/* 详情面板 */
.detail-panel {
  flex-shrink: 0;
  background: var(--card-bg);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  overflow: hidden;
  max-height: 350px;
  display: flex;
  flex-direction: column;
}

.detail-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color-light);
}

.detail-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--text-primary);
  font-size: 14px;
}

.detail-panel-content {
  flex: 1;
  overflow: auto;
  padding: 12px;
}

/* 表格样式调整 */
:deep(.el-table) {
  background: var(--card-bg);
  color: var(--text-primary);
}

:deep(.el-table th) {
  background: var(--bg-secondary) !important;
  color: var(--text-secondary);
  font-weight: 600;
}

:deep(.el-table tr) {
  background: var(--card-bg);
}

:deep(.el-table--striped .el-table__body tr.el-table__row--striped td) {
  background: var(--bg-secondary);
}

:deep(.el-table__body tr:hover > td) {
  background: var(--hover-bg) !important;
}

:deep(.el-table td),
:deep(.el-table th) {
  border-color: var(--border-color-light);
}

/* 选中行样式 */
:deep(.el-table .selected-row) {
  background: var(--accent-color) !important;
  opacity: 0.15;
}

:deep(.el-table .selected-row td) {
  background: transparent !important;
}

:deep(.el-table .selected-row:hover td) {
  background: transparent !important;
}

/* nethogs 状态指示 */
.nethogs-status {
  margin-right: 10px;
}
</style>

