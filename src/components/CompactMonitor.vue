<template>
  <div class="compact-monitor">
    <!-- CPU 监控 -->
    <div class="monitor-item">
      <div class="monitor-header">
        <el-icon :size="14"><Cpu /></el-icon>
        <span class="monitor-title">CPU</span>
      </div>
      <div class="monitor-value" :class="getCpuClass()">
        {{ cpuUsage.toFixed(1) }}%
      </div>
      <el-progress
        :percentage="cpuUsage"
        :color="getCpuColor()"
        :show-text="false"
        :stroke-width="4"
      />
      <div class="monitor-detail">
        {{ cpuInfo.cores }} 核心
      </div>
      <el-tooltip v-if="cpuInfo.model" placement="top" effect="dark">
        <template #content>
          {{ cpuInfo.model }}
        </template>
        <div class="cpu-model">
          {{ formatCpuModel(cpuInfo.model) }}
        </div>
      </el-tooltip>
    </div>

    <!-- 内存监控 -->
    <div class="monitor-item">
      <div class="monitor-header">
        <el-icon :size="14"><Memo /></el-icon>
        <span class="monitor-title">内存</span>
      </div>
      <div class="monitor-value" :class="getMemoryClass()">
        {{ memoryUsage.toFixed(1) }}%
      </div>
      <el-progress
        :percentage="memoryUsage"
        :color="getMemoryColor()"
        :show-text="false"
        :stroke-width="4"
      />
      <div class="monitor-detail">
        {{ formatBytes(memoryInfo.used) }} / {{ formatBytes(memoryInfo.total) }}
      </div>
    </div>

    <!-- 网络监控 -->
    <div class="monitor-item clickable" @click="openNetworkMonitor">
      <div class="monitor-header">
        <el-icon :size="14"><Connection /></el-icon>
        <span class="monitor-title">网络</span>
      </div>
      
      <!-- 网卡选择 -->
      <el-select 
        v-model="selectedInterface" 
        size="small" 
        class="interface-select"
        @click.stop
        @change="handleInterfaceChange"
      >
        <el-option
          v-for="iface in networkInterfaces"
          :key="iface"
          :label="iface"
          :value="iface"
        />
      </el-select>
      
      <div class="network-stats">
        <div class="network-stat">
          <span class="stat-icon">↓</span>
          <span class="stat-value">{{ formatSpeed(networkInfo.rxSpeed) }}</span>
        </div>
        <div class="network-stat">
          <span class="stat-icon">↑</span>
          <span class="stat-value">{{ formatSpeed(networkInfo.txSpeed) }}</span>
        </div>
      </div>
      <div class="monitor-detail">
        {{ formatBytes(networkInfo.rxTotal) }} / {{ formatBytes(networkInfo.txTotal) }}
      </div>
      <div class="monitor-hint">点击查看详情 →</div>
    </div>

    <!-- 磁盘 IO 监控 -->
    <div class="monitor-item">
      <div class="monitor-header">
        <el-icon :size="14"><Document /></el-icon>
        <span class="monitor-title">磁盘 IO</span>
      </div>
      <div class="network-stats">
        <div class="network-stat">
          <span class="stat-icon">R</span>
          <span class="stat-value">{{ formatSpeed(diskIO.readSpeed) }}</span>
        </div>
        <div class="network-stat">
          <span class="stat-icon">W</span>
          <span class="stat-value">{{ formatSpeed(diskIO.writeSpeed) }}</span>
        </div>
      </div>
      <div class="monitor-detail">
        读: {{ formatBytes(diskIO.readTotal) }} / 写: {{ formatBytes(diskIO.writeTotal) }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { Cpu, Memo, Connection, Document } from '@element-plus/icons-vue'

const props = defineProps({
  connectionId: {
    type: [String, Number],
    required: true
  }
})

const emit = defineEmits(['open-network-monitor'])

// 监控数据
const cpuUsage = ref(0)
const memoryUsage = ref(0)
const cpuInfo = ref({
  cores: 0,
  model: ''
})
const memoryInfo = ref({
  total: 0,
  used: 0,
  available: 0
})
const networkInfo = ref({
  rxSpeed: 0,
  txSpeed: 0,
  rxTotal: 0,
  txTotal: 0
})
const diskIO = ref({
  readSpeed: 0,
  writeSpeed: 0,
  readTotal: 0,
  writeTotal: 0
})

// 网络接口列表
const networkInterfaces = ref([])
const selectedInterface = ref('all')

// 上一次的数据（用于计算速率）
let lastNetworkData = { rx: 0, tx: 0, timestamp: Date.now() }
let lastDiskData = { read: 0, write: 0, timestamp: Date.now() }

// 定时器
let updateTimer = null

// 获取 CPU 颜色
const getCpuColor = () => {
  if (cpuUsage.value < 50) return '#67c23a'
  if (cpuUsage.value < 80) return '#e6a23c'
  return '#f56c6c'
}

// 获取 CPU 类名
const getCpuClass = () => {
  if (cpuUsage.value < 50) return 'value-normal'
  if (cpuUsage.value < 80) return 'value-warning'
  return 'value-danger'
}

// 获取内存颜色
const getMemoryColor = () => {
  if (memoryUsage.value < 70) return '#67c23a'
  if (memoryUsage.value < 90) return '#e6a23c'
  return '#f56c6c'
}

// 获取内存类名
const getMemoryClass = () => {
  if (memoryUsage.value < 70) return 'value-normal'
  if (memoryUsage.value < 90) return 'value-warning'
  return 'value-danger'
}

// 格式化字节数
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// 格式化速度
const formatSpeed = (bytesPerSecond) => {
  return formatBytes(bytesPerSecond) + '/s'
}

// 格式化 CPU 型号（简化显示）
const formatCpuModel = (model) => {
  if (!model) return ''
  
  // 移除常见的前缀和后缀
  let simplified = model
    .replace(/Intel\(R\)\s*/gi, '')
    .replace(/AMD\s*/gi, '')
    .replace(/Core\(TM\)\s*/gi, '')
    .replace(/Processor\s*/gi, '')
    .replace(/CPU\s*/gi, '')
    .replace(/@.*$/g, '') // 移除频率信息
    .trim()
  
  // 如果还是太长，截断并添加省略号
  if (simplified.length > 24) {
    simplified = simplified.substring(0, 24) + '...'
  }
  
  return simplified
}

// 更新监控数据
const updateMonitorData = async () => {
  if (!window.electronAPI || !props.connectionId) return
  
  // 检查 API 是否存在
  if (!window.electronAPI.ssh.getSystemMonitor) {
    console.warn('系统监控 API 不可用，请重启 Electron 应用')
    return
  }

  try {
    // 获取系统监控数据
    const result = await window.electronAPI.ssh.getSystemMonitor(props.connectionId)
    
    if (result.success && result.data) {
      const data = result.data
      
      // 更新 CPU 数据
      if (data.cpu) {
        cpuUsage.value = data.cpu.usage || 0
        cpuInfo.value = {
          cores: data.cpu.cores || 0,
          model: data.cpu.model || ''
        }
      }
      
      // 更新内存数据
      if (data.memory) {
        const total = data.memory.total || 1
        const used = data.memory.used || 0
        memoryUsage.value = (used / total) * 100
        memoryInfo.value = {
          total: total,
          used: used,
          available: data.memory.available || 0
        }
      }
      
      // 更新网络数据并计算速率（支持选择网卡）
      if (data.network) {
        const now = Date.now()
        const timeDiff = (now - lastNetworkData.timestamp) / 1000 // 秒
        
        // 根据选择的网卡获取对应的数据
        let rxBytes = 0
        let txBytes = 0
        
        if (selectedInterface.value === 'all') {
          // 汇总所有网卡
          rxBytes = data.network.rxBytes || 0
          txBytes = data.network.txBytes || 0
        } else if (data.network.interfaces && data.network.interfaces[selectedInterface.value]) {
          // 使用选中的网卡
          const iface = data.network.interfaces[selectedInterface.value]
          rxBytes = iface.rxBytes || 0
          txBytes = iface.txBytes || 0
        }
        
        const rxDiff = rxBytes - lastNetworkData.rx
        const txDiff = txBytes - lastNetworkData.tx
        
        networkInfo.value = {
          rxSpeed: timeDiff > 0 && rxDiff >= 0 ? rxDiff / timeDiff : 0,
          txSpeed: timeDiff > 0 && txDiff >= 0 ? txDiff / timeDiff : 0,
          rxTotal: rxBytes,
          txTotal: txBytes
        }
        
        lastNetworkData = {
          rx: rxBytes,
          tx: txBytes,
          timestamp: now
        }
      }
      
      // 更新磁盘 IO 数据并计算速率
      if (data.diskIO) {
        const now = Date.now()
        const timeDiff = (now - lastDiskData.timestamp) / 1000 // 秒
        
        const readDiff = (data.diskIO.readBytes || 0) - lastDiskData.read
        const writeDiff = (data.diskIO.writeBytes || 0) - lastDiskData.write
        
        diskIO.value = {
          readSpeed: timeDiff > 0 ? readDiff / timeDiff : 0,
          writeSpeed: timeDiff > 0 ? writeDiff / timeDiff : 0,
          readTotal: data.diskIO.readBytes || 0,
          writeTotal: data.diskIO.writeBytes || 0
        }
        
        lastDiskData = {
          read: data.diskIO.readBytes || 0,
          write: data.diskIO.writeBytes || 0,
          timestamp: now
        }
      }
    }
  } catch (error) {
    console.error('获取监控数据失败:', error)
  }
}

// 获取网络接口列表
const getNetworkInterfaces = async () => {
  if (!window.electronAPI || !props.connectionId) return
  
  try {
    const result = await window.electronAPI.ssh.getNetworkInterfaces(props.connectionId)
    if (result.success && result.interfaces) {
      networkInterfaces.value = ['all', ...result.interfaces]
      selectedInterface.value = 'all'
    }
  } catch (error) {
    console.error('获取网络接口失败:', error)
  }
}

// 切换网卡
const handleInterfaceChange = () => {
  // 重置网络数据
  lastNetworkData = { rx: 0, tx: 0, timestamp: Date.now() }
  // 立即更新
  updateMonitorData()
}

// 打开网络监控详情
const openNetworkMonitor = () => {
  emit('open-network-monitor')
}

// 组件挂载
onMounted(async () => {
  // 获取网络接口列表
  await getNetworkInterfaces()
  
  // 立即获取一次数据
  updateMonitorData()
  
  // 每秒更新一次
  updateTimer = setInterval(updateMonitorData, 1000)
})

// 组件卸载
onUnmounted(() => {
  if (updateTimer) {
    clearInterval(updateTimer)
  }
})
</script>

<style scoped>
.compact-monitor {
  width: 100%;
  height: 100%;
  background: var(--bg-secondary);
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.monitor-item {
  background: var(--card-bg);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  padding: 12px;
  transition: all 0.3s ease;
}

.monitor-item:hover {
  border-color: var(--accent-color);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.monitor-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: var(--text-secondary);
}

.monitor-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.monitor-value {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 8px;
  font-family: 'Cascadia Code', 'JetBrains Mono', monospace;
  transition: color 0.3s ease;
}

.monitor-value.value-normal {
  color: #67c23a;
}

.monitor-value.value-warning {
  color: #e6a23c;
}

.monitor-value.value-danger {
  color: #f56c6c;
}

.monitor-detail {
  font-size: 10px;
  color: var(--text-secondary);
  margin-top: 6px;
  font-family: 'Cascadia Code', monospace;
}

/* CPU 型号 */
.cpu-model {
  font-size: 9px;
  color: var(--text-tertiary);
  margin-top: 4px;
  font-style: italic;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.7;
  transition: opacity 0.2s ease;
}

.cpu-model:hover {
  opacity: 1;
}

.network-stats {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.network-stat {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-family: 'Cascadia Code', monospace;
}

.stat-icon {
  font-weight: bold;
  color: var(--accent-color);
  font-size: 12px;
}

.stat-value {
  color: var(--text-primary);
  font-weight: 600;
}

/* 滚动条样式 */
.compact-monitor::-webkit-scrollbar {
  width: 4px;
}

.compact-monitor::-webkit-scrollbar-track {
  background: var(--scrollbar-bg);
}

.compact-monitor::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 2px;
}

.compact-monitor::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

/* 可点击的监控项 */
.monitor-item.clickable {
  cursor: pointer;
}

.monitor-item.clickable:hover {
  transform: translateY(-1px);
}

/* 网卡选择器 */
.interface-select {
  width: 100%;
  margin-bottom: 8px;
}

/* 提示文字 */
.monitor-hint {
  font-size: 9px;
  color: var(--accent-color);
  text-align: center;
  margin-top: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.monitor-item.clickable:hover .monitor-hint {
  opacity: 1;
}
</style>

