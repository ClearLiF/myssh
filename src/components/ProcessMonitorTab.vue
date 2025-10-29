<template>
  <div class="process-monitor-tab">
    <!-- 工具栏 -->
    <div class="monitor-toolbar">
      <div class="toolbar-left">
        <el-icon :size="20"><Monitor /></el-icon>
        <span class="toolbar-title">进程监控</span>
        <el-tag v-if="isConnected" type="success" size="small">
          {{ connection.username }}@{{ connection.host }}
        </el-tag>
      </div>
      <div class="toolbar-right">
        <el-input
          v-model="searchKeyword"
          size="small"
          placeholder="搜索进程..."
          style="width: 200px"
          clearable
          :prefix-icon="Search"
        />
        <el-button size="small" @click="refreshProcesses">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button size="small" @click="autoRefresh = !autoRefresh" :type="autoRefresh ? 'primary' : ''">
          <el-icon><Timer /></el-icon>
          {{ autoRefresh ? '停止' : '自动' }}
        </el-button>
      </div>
    </div>

    <!-- 进程列表 -->
    <div class="process-table-container" :class="{ 'has-detail': selectedProcess }">
      <el-table
        ref="processTable"
        :data="filteredProcesses"
        :height="tableHeight"
        stripe
        :default-sort="{ prop: 'cpu', order: 'descending' }"
        style="width: 100%"
        class="process-table"
        @row-click="handleRowClick"
        @row-contextmenu="handleContextMenu"
        :row-class-name="getRowClassName"
        highlight-current-row
      >
        <el-table-column prop="pid" label="PID" width="80" sortable />
        <el-table-column prop="user" label="用户" width="100" sortable />
        <el-table-column prop="memoryPercent" label="内存" width="150" sortable>
          <template #default="scope">
            <div class="memory-cell">
              <span class="memory-size">{{ scope.row.memorySize }}</span>
              <span class="memory-percent">({{ scope.row.memoryPercent }}%)</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="cpu" label="CPU" width="80" sortable>
          <template #default="scope">
            <span :class="getCpuClass(scope.row.cpuNum)">
              {{ scope.row.cpu }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="ports" label="端口" width="120" sortable show-overflow-tooltip />
        <el-table-column prop="command" label="命令" show-overflow-tooltip />
        <el-table-column label="名称 | 命令行" min-width="300" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.fullCommand }}
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 底部详情面板 -->
    <div v-if="selectedProcess" class="detail-panel">
      <div class="detail-panel-header">
        <div class="detail-panel-title">
          <el-icon :size="18"><Document /></el-icon>
          <span>进程详情 - PID: {{ selectedProcess.pid }}</span>
        </div>
        <el-button size="small" text @click="closeDetail">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
      
      <div class="detail-panel-content" v-loading="detailLoading">
        <div v-if="processDetail" class="detail-content">
          <div class="detail-section">
            <div class="detail-item">
              <span class="detail-label">PID:</span>
              <span class="detail-value">{{ processDetail.pid }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">名称:</span>
              <span class="detail-value">{{ processDetail.name }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">工作目录:</span>
              <span class="detail-value">{{ processDetail.cwd }}</span>
            </div>
          </div>
          
          <div class="detail-section">
            <div class="detail-header">环境变量</div>
            <div class="env-container">
              <div v-for="(value, key) in processDetail.env" :key="key" class="env-item">
                <span class="env-key">{{ key }}</span>
                <span class="env-value">{{ value }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenuVisible"
      class="context-menu"
      :style="{ top: contextMenuPosition.y + 'px', left: contextMenuPosition.x + 'px' }"
      @click.stop
    >
      <div class="context-menu-item" @click="copyPid">
        <el-icon><DocumentCopy /></el-icon>
        <span>复制 PID</span>
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger" @click="killProcess('TERM')">
        <el-icon><CircleClose /></el-icon>
        <span>终止进程 (SIGTERM)</span>
      </div>
      <div class="context-menu-item danger" @click="killProcess('KILL')">
        <el-icon><Close /></el-icon>
        <span>强制终止 (SIGKILL)</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Monitor, Search, Refresh, Timer, Document, Close, DocumentCopy, CircleClose } from '@element-plus/icons-vue'

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

// 状态
const isConnected = ref(true)
const processes = ref([])
const searchKeyword = ref('')
const autoRefresh = ref(true)
const selectedProcess = ref(null)
const processDetail = ref(null)
const detailLoading = ref(false)
const processTable = ref(null)
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuProcess = ref(null)

// 定时器
let refreshTimer = null

// 计算表格高度
const tableHeight = computed(() => {
  return selectedProcess.value ? '100%' : '100%'
})

// 过滤后的进程列表
const filteredProcesses = computed(() => {
  if (!searchKeyword.value) {
    return processes.value
  }
  
  const keyword = searchKeyword.value.toLowerCase()
  return processes.value.filter(p => {
    return p.pid.toString().includes(keyword) ||
           p.user.toLowerCase().includes(keyword) ||
           p.command.toLowerCase().includes(keyword) ||
           p.fullCommand.toLowerCase().includes(keyword)
  })
})

// 获取 CPU 使用率类名
const getCpuClass = (cpuNum) => {
  if (cpuNum > 50) return 'cpu-high'
  if (cpuNum > 20) return 'cpu-medium'
  return 'cpu-low'
}

// 获取行类名
const getRowClassName = ({ row }) => {
  return selectedProcess.value && selectedProcess.value.pid === row.pid ? 'selected-row' : ''
}

// 处理行点击 - 显示详情
const handleRowClick = async (row) => {
  selectedProcess.value = row
  processDetail.value = null
  await loadProcessDetail(row)
}

// 关闭详情面板
const closeDetail = () => {
  selectedProcess.value = null
  processDetail.value = null
}

// 处理右键菜单
const handleContextMenu = (row, column, event) => {
  event.preventDefault()
  contextMenuProcess.value = row
  contextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY
  }
  contextMenuVisible.value = true
}

// 复制 PID
const copyPid = async () => {
  if (contextMenuProcess.value) {
    try {
      await navigator.clipboard.writeText(contextMenuProcess.value.pid)
      ElMessage.success(`已复制 PID: ${contextMenuProcess.value.pid}`)
    } catch (error) {
      ElMessage.error('复制失败')
    }
  }
  contextMenuVisible.value = false
}

// 终止进程
const killProcess = async (signal) => {
  const process = contextMenuProcess.value
  contextMenuVisible.value = false
  
  if (!process) return
  
  const signalName = signal === 'KILL' ? '强制终止 (SIGKILL)' : '终止 (SIGTERM)'
  
  try {
    await ElMessageBox.confirm(
      `确定要${signalName}进程 ${process.pid} (${process.command}) 吗？`,
      '确认终止',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    if (!window.electronAPI || !props.connectionId) {
      ElMessage.success('演示模式：进程已终止')
      return
    }
    
    const result = await window.electronAPI.ssh.killProcess(props.connectionId, process.pid, signal)
    
    if (result.success) {
      ElMessage.success(result.message || '进程已终止')
      // 刷新进程列表
      await refreshProcesses()
    } else {
      ElMessage.error(result.message || '终止进程失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('终止进程失败:', error)
      ElMessage.error('终止进程失败: ' + error.message)
    }
  }
}

// 点击其他地方关闭右键菜单
const handleClickOutside = () => {
  contextMenuVisible.value = false
}

// 加载进程详细信息
const loadProcessDetail = async (row) => {
  if (!window.electronAPI || !props.connectionId) {
    // 模拟数据
    processDetail.value = {
      pid: row.pid,
      name: row.command,
      cwd: '/usr/local/openjdk-11/bin',
      env: {
        'DBUS_SESSION_BUS_ADDRESS': 'unix:path=/run/user/0/bus',
        'HISTSIZE': '1000',
        'HISTTIMEFORMAT': '%F',
        'HOME': '/root',
        'LANG': 'en_US',
        'LANGUAGE': 'en_US',
        'LC_ALL': 'en_US',
        'LESSCLOSE': '/usr/bin/lesspipe',
        'LESSOPEN': '|',
        'LOGNAME': 'root',
        'LS_COLORS': 'rs=0:di=01;34:ln=01;36:mh=00:pi=40;33:so=01;35:do=01',
        'MOTD_SHOWN': 'pam',
        'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        'PROMPT_COMMAND': 'history',
        'PWD': '/root',
        'SHELL': '/bin/bash',
        'SHLVL': '1'
      }
    }
    return
  }

  try {
    detailLoading.value = true
    const result = await window.electronAPI.ssh.getProcessDetail(props.connectionId, row.pid)
    
    if (result.success && result.detail) {
      processDetail.value = result.detail
    } else {
      ElMessage.error('获取进程详情失败: ' + (result.message || '未知错误'))
    }
  } catch (error) {
    console.error('获取进程详情失败:', error)
    ElMessage.error('获取进程详情失败: ' + error.message)
  } finally {
    detailLoading.value = false
  }
}

// 刷新进程列表
const refreshProcesses = async () => {
  if (!window.electronAPI || !props.connectionId) {
    // 模拟数据
    processes.value = [
      {
        pid: '97467',
        user: 'root',
        memorySize: '1.3G',
        memoryPercent: 1.3,
        cpu: '0.7',
        cpuNum: 0.7,
        command: 'java',
        fullCommand: 'java | java -Dfile.encoding=utf-8 -Dsun.jnu.encoding=UTF8 -jar /timecheck.jar',
        ports: '8080, 8443'
      },
      {
        pid: '86206',
        user: 'root',
        memorySize: '663.4M',
        memoryPercent: 12.3,
        cpu: '0.3',
        cpuNum: 0.3,
        command: 'java',
        fullCommand: 'java | java -Dfile.encoding=utf-8 -Dsun.jnu.encoding=UTF8 -jar /sentien.jar',
        ports: '9090'
      },
      {
        pid: '93572',
        user: 'root',
        memorySize: '3.6M',
        memoryPercent: 0.3,
        cpu: '0.3',
        cpuNum: 0.3,
        command: 'top',
        fullCommand: 'top',
        ports: '3306, 33060'
      }
    ]
    return
  }

  try {
    const result = await window.electronAPI.ssh.getProcessList(props.connectionId)
    
    if (result.success && result.processes) {
      processes.value = result.processes
    } else {
      ElMessage.error('获取进程列表失败: ' + (result.message || '未知错误'))
    }
  } catch (error) {
    console.error('获取进程列表失败:', error)
    ElMessage.error('获取进程列表失败: ' + error.message)
  }
}

// 监听自动刷新状态
watch(autoRefresh, (newVal) => {
  if (newVal) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
})

// 启动自动刷新
const startAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
  refreshTimer = setInterval(() => {
    refreshProcesses()
  }, 2000) // 每 2 秒刷新一次
}

// 停止自动刷新
const stopAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

// 组件挂载（已在上面添加了全局点击监听）
onMounted(() => {
  refreshProcesses()
  if (autoRefresh.value) {
    startAutoRefresh()
  }
  document.addEventListener('click', handleClickOutside)
})

// 组件卸载（已在上面添加了移除监听）
onUnmounted(() => {
  stopAutoRefresh()
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.process-monitor-tab {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  transition: background-color 0.3s ease;
}

.monitor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

.process-table-container {
  overflow: hidden;
  padding: 16px;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.process-table {
  background: var(--bg-primary) !important;
}

.process-table :deep(.el-table__header) {
  background: var(--bg-secondary) !important;
}

.process-table :deep(.el-table__header th) {
  background: var(--bg-secondary) !important;
  color: var(--text-primary) !important;
  font-weight: 600;
}

.process-table :deep(.el-table__row) {
  background: var(--card-bg) !important;
  transition: background-color 0.3s ease;
  cursor: pointer;
}

.process-table :deep(.el-table__row:hover) {
  background: var(--hover-bg) !important;
}

.process-table :deep(.el-table__row.el-table__row--striped) {
  background: var(--bg-secondary) !important;
}

.process-table :deep(.el-table__row.el-table__row--striped:hover) {
  background: var(--hover-bg) !important;
}

.process-table :deep(td) {
  color: var(--text-primary) !important;
  border-color: var(--border-color-light) !important;
}

.cpu-low {
  color: #67c23a;
  font-weight: 600;
}

.cpu-medium {
  color: #e6a23c;
  font-weight: 600;
}

.cpu-high {
  color: #f56c6c;
  font-weight: 600;
}

.memory-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.memory-size {
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'Cascadia Code', 'JetBrains Mono', monospace;
  font-size: 13px;
}

.memory-percent {
  color: var(--text-secondary);
  font-size: 11px;
  font-family: 'Cascadia Code', 'JetBrains Mono', monospace;
}

/* 进程详情 */
.process-detail {
  padding: 20px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  min-height: 100px;
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-header {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 8px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  background: var(--card-bg);
  border-radius: 4px;
}

.detail-label {
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 80px;
  font-size: 13px;
}

.detail-value {
  color: var(--text-primary);
  font-family: 'Cascadia Code', 'JetBrains Mono', monospace;
  font-size: 13px;
  flex: 1;
  word-break: break-all;
}

.env-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
  padding: 8px;
  background: var(--card-bg);
  border-radius: 4px;
}

.env-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-primary);
  border-radius: 4px;
  border: 1px solid var(--border-color);
  transition: all 0.2s;
}

.env-item:hover {
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
}

.env-key {
  font-weight: 600;
  color: #42A5F5;
  font-size: 12px;
  font-family: 'Cascadia Code', 'JetBrains Mono', monospace;
  white-space: nowrap;
}

.env-value {
  color: var(--text-primary);
  font-size: 12px;
  font-family: 'Cascadia Code', 'JetBrains Mono', monospace;
  word-break: break-all;
  flex: 1;
}

.detail-empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 40px;
  font-size: 14px;
}

.selected-row {
  background: rgba(102, 126, 234, 0.1) !important;
}

/* 底部详情面板 */
.detail-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-top: 2px solid var(--border-color);
  background: var(--bg-secondary);
  overflow: hidden;
}

.detail-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.detail-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.detail-panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* 右键菜单 */
.context-menu {
  position: fixed;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 4px;
  z-index: 9999;
  min-width: 180px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 13px;
  transition: all 0.2s;
}

.context-menu-item:hover {
  background: var(--hover-bg);
}

.context-menu-item.danger {
  color: #f56c6c;
}

.context-menu-item.danger:hover {
  background: rgba(245, 108, 108, 0.1);
}

.context-menu-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}
</style>

