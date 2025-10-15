<template>
  <div class="system-monitor">
    <el-row :gutter="20">
      <!-- 系统概览卡片 -->
      <el-col :span="6" v-for="metric in systemMetrics" :key="metric.key">
        <el-card class="metric-card" :class="metric.status">
          <div class="metric-content">
            <div class="metric-icon">
              <el-icon :size="32">
                <component :is="metric.icon" />
              </el-icon>
            </div>
            <div class="metric-info">
              <div class="metric-value">{{ metric.value }}</div>
              <div class="metric-label">{{ metric.label }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 详细监控信息 -->
    <el-row :gutter="20" class="monitor-section">
      <!-- CPU 使用率 -->
      <el-col :span="12">
        <el-card class="monitor-card">
          <template #header>
            <div class="card-header">
              <span>CPU 使用率</span>
              <el-tag :type="getCpuStatusType()">{{ getCpuStatusText() }}</el-tag>
            </div>
          </template>
          
          <div class="chart-container">
            <el-progress 
              type="dashboard" 
              :percentage="cpuUsage" 
              :color="getCpuColor()"
              :width="120"
            />
            <div class="chart-info">
              <p>核心数: {{ cpuInfo.cores }}</p>
              <p>型号: {{ cpuInfo.model }}</p>
              <p>负载: {{ cpuInfo.load }}</p>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 内存使用率 -->
      <el-col :span="12">
        <el-card class="monitor-card">
          <template #header>
            <div class="card-header">
              <span>内存使用率</span>
              <el-tag :type="getMemoryStatusType()">{{ getMemoryStatusText() }}</el-tag>
            </div>
          </template>
          
          <div class="chart-container">
            <el-progress 
              type="dashboard" 
              :percentage="memoryUsage" 
              :color="getMemoryColor()"
              :width="120"
            />
            <div class="chart-info">
              <p>总内存: {{ formatBytes(memoryInfo.total) }}</p>
              <p>已使用: {{ formatBytes(memoryInfo.used) }}</p>
              <p>可用: {{ formatBytes(memoryInfo.available) }}</p>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 磁盘和网络监控 -->
    <el-row :gutter="20" class="monitor-section">
      <!-- 磁盘使用情况 -->
      <el-col :span="12">
        <el-card class="monitor-card">
          <template #header>
            <span>磁盘使用情况</span>
          </template>
          
          <div class="disk-list">
            <div 
              v-for="disk in diskInfo" 
              :key="disk.mountpoint" 
              class="disk-item"
            >
              <div class="disk-header">
                <span class="disk-name">{{ disk.mountpoint }}</span>
                <span class="disk-size">{{ formatBytes(disk.total) }}</span>
              </div>
              <el-progress 
                :percentage="disk.usage" 
                :color="getDiskColor(disk.usage)"
                :stroke-width="8"
              />
              <div class="disk-details">
                <span>已用: {{ formatBytes(disk.used) }}</span>
                <span>可用: {{ formatBytes(disk.available) }}</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 网络连接 -->
      <el-col :span="12">
        <el-card class="monitor-card">
          <template #header>
            <span>网络连接</span>
          </template>
          
          <div class="network-info">
            <div class="network-item">
              <span class="network-label">活跃连接数:</span>
              <span class="network-value">{{ networkInfo.activeConnections }}</span>
            </div>
            <div class="network-item">
              <span class="network-label">入站流量:</span>
              <span class="network-value">{{ formatBytes(networkInfo.inbound) }}/s</span>
            </div>
            <div class="network-item">
              <span class="network-label">出站流量:</span>
              <span class="network-value">{{ formatBytes(networkInfo.outbound) }}/s</span>
            </div>
            <div class="network-item">
              <span class="network-label">TCP 连接:</span>
              <span class="network-value">{{ networkInfo.tcpConnections }}</span>
            </div>
            <div class="network-item">
              <span class="network-label">UDP 连接:</span>
              <span class="network-value">{{ networkInfo.udpConnections }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 进程列表 -->
    <el-row class="monitor-section">
      <el-col :span="24">
        <el-card class="monitor-card">
          <template #header>
            <div class="card-header">
              <span>进程列表</span>
              <el-button size="small" @click="refreshProcesses">
                <el-icon><Refresh /></el-icon>
                刷新
              </el-button>
            </div>
          </template>
          
          <el-table :data="processList" style="width: 100%" height="300">
            <el-table-column prop="pid" label="PID" width="80" />
            <el-table-column prop="name" label="进程名" width="200" />
            <el-table-column prop="cpu" label="CPU%" width="100">
              <template #default="scope">
                <el-progress 
                  :percentage="scope.row.cpu" 
                  :stroke-width="6"
                  :show-text="false"
                />
                <span style="margin-left: 8px">{{ scope.row.cpu.toFixed(1) }}%</span>
              </template>
            </el-table-column>
            <el-table-column prop="memory" label="内存%" width="100">
              <template #default="scope">
                <el-progress 
                  :percentage="scope.row.memory" 
                  :stroke-width="6"
                  :show-text="false"
                />
                <span style="margin-left: 8px">{{ scope.row.memory.toFixed(1) }}%</span>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="scope">
                <el-tag :type="getProcessStatusType(scope.row.status)">
                  {{ scope.row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="user" label="用户" width="120" />
            <el-table-column prop="command" label="命令" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- 实时图表 -->
    <el-row class="monitor-section">
      <el-col :span="24">
        <el-card class="monitor-card">
          <template #header>
            <span>实时监控图表</span>
          </template>
          
          <div class="chart-placeholder">
            <el-empty description="实时监控图表区域">
              <template #image>
                                 <el-icon :size="64" color="#909399">
                   <Menu />
                 </el-icon>
              </template>
              <p>这里可以集成 ECharts 等图表库来显示实时监控数据</p>
            </el-empty>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { 
  Monitor, 
  Setting, 
  Document, 
  Folder, 
  Link, 
  Refresh,
  Menu
} from '@element-plus/icons-vue'

// 系统指标数据
const systemMetrics = ref([
  {
    key: 'cpu',
    label: 'CPU 使用率',
    value: '0%',
    icon: Setting,
    status: 'normal'
  },
  {
    key: 'memory',
    label: '内存使用率',
    value: '0%',
    icon: Document,
    status: 'normal'
  },
  {
    key: 'disk',
    label: '磁盘使用率',
    value: '0%',
    icon: Folder,
    status: 'normal'
  },
  {
    key: 'network',
    label: '网络状态',
    value: '正常',
    icon: Link,
    status: 'normal'
  }
])

// 监控数据
const cpuUsage = ref(0)
const memoryUsage = ref(0)
const cpuInfo = ref({
  cores: 8,
  model: 'Intel Core i7-10700K',
  load: '0.0, 0.0, 0.0'
})
const memoryInfo = ref({
  total: 0,
  used: 0,
  available: 0
})
const diskInfo = ref([])
const networkInfo = ref({
  activeConnections: 0,
  inbound: 0,
  outbound: 0,
  tcpConnections: 0,
  udpConnections: 0
})
const processList = ref([])

// 定时器
let monitorTimer = null

// 获取 CPU 状态类型
const getCpuStatusType = () => {
  if (cpuUsage.value < 50) return 'success'
  if (cpuUsage.value < 80) return 'warning'
  return 'danger'
}

// 获取 CPU 状态文本
const getCpuStatusText = () => {
  if (cpuUsage.value < 50) return '正常'
  if (cpuUsage.value < 80) return '偏高'
  return '过高'
}

// 获取 CPU 颜色
const getCpuColor = () => {
  if (cpuUsage.value < 50) return '#67c23a'
  if (cpuUsage.value < 80) return '#e6a23c'
  return '#f56c6c'
}

// 获取内存状态类型
const getMemoryStatusType = () => {
  if (memoryUsage.value < 70) return 'success'
  if (memoryUsage.value < 90) return 'warning'
  return 'danger'
}

// 获取内存状态文本
const getMemoryStatusText = () => {
  if (memoryUsage.value < 70) return '正常'
  if (memoryUsage.value < 90) return '偏高'
  return '过高'
}

// 获取内存颜色
const getMemoryColor = () => {
  if (memoryUsage.value < 70) return '#67c23a'
  if (memoryUsage.value < 90) return '#e6a23c'
  return '#f56c6c'
}

// 获取磁盘颜色
const getDiskColor = (usage) => {
  if (usage < 70) return '#67c23a'
  if (usage < 90) return '#e6a23c'
  return '#f56c6c'
}

// 获取进程状态类型
const getProcessStatusType = (status) => {
  const statusMap = {
    'R': 'success',
    'S': 'info',
    'D': 'warning',
    'Z': 'danger',
    'T': 'warning'
  }
  return statusMap[status] || 'info'
}

// 格式化字节数
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 刷新进程列表
const refreshProcesses = () => {
  // 模拟刷新进程数据
  processList.value = [
    {
      pid: 1,
      name: 'systemd',
      cpu: Math.random() * 5,
      memory: Math.random() * 10,
      status: 'S',
      user: 'root',
      command: '/sbin/init'
    },
    {
      pid: 1234,
      name: 'nginx',
      cpu: Math.random() * 15,
      memory: Math.random() * 20,
      status: 'S',
      user: 'nginx',
      command: 'nginx: master process'
    },
    {
      pid: 5678,
      name: 'node',
      cpu: Math.random() * 25,
      memory: Math.random() * 30,
      status: 'R',
      user: 'user',
      command: 'node app.js'
    }
  ]
}

// 更新监控数据
const updateMonitorData = () => {
  // 模拟实时数据更新
  cpuUsage.value = Math.floor(Math.random() * 100)
  memoryUsage.value = Math.floor(Math.random() * 100)
  
  // 更新系统指标
  systemMetrics.value[0].value = `${cpuUsage.value}%`
  systemMetrics.value[1].value = `${memoryUsage.value}%`
  
  // 更新内存信息
  const totalMemory = 16 * 1024 * 1024 * 1024 // 16GB
  const usedMemory = (memoryUsage.value / 100) * totalMemory
  memoryInfo.value = {
    total: totalMemory,
    used: usedMemory,
    available: totalMemory - usedMemory
  }
  
  // 更新磁盘信息
  diskInfo.value = [
    {
      mountpoint: '/',
      total: 500 * 1024 * 1024 * 1024, // 500GB
      used: Math.random() * 400 * 1024 * 1024 * 1024,
      available: 0,
      usage: 0
    },
    {
      mountpoint: '/home',
      total: 1 * 1024 * 1024 * 1024 * 1024, // 1TB
      used: Math.random() * 800 * 1024 * 1024 * 1024,
      available: 0,
      usage: 0
    }
  ]
  
  // 计算磁盘使用率
  diskInfo.value.forEach(disk => {
    disk.available = disk.total - disk.used
    disk.usage = Math.floor((disk.used / disk.total) * 100)
  })
  
  // 更新网络信息
  networkInfo.value = {
    activeConnections: Math.floor(Math.random() * 1000) + 100,
    inbound: Math.random() * 1024 * 1024, // 1MB/s
    outbound: Math.random() * 512 * 1024, // 512KB/s
    tcpConnections: Math.floor(Math.random() * 800) + 50,
    udpConnections: Math.floor(Math.random() * 200) + 20
  }
  
  // 更新系统指标状态
  systemMetrics.value[0].status = getCpuStatusType()
  systemMetrics.value[1].status = getMemoryStatusType()
  systemMetrics.value[2].status = diskInfo.value.some(d => d.usage > 90) ? 'warning' : 'normal'
  systemMetrics.value[3].status = 'normal'
}

// 组件挂载
onMounted(() => {
  // 初始化数据
  updateMonitorData()
  refreshProcesses()
  
  // 启动定时器，每秒更新一次
  monitorTimer = setInterval(() => {
    updateMonitorData()
  }, 1000)
})

// 组件卸载
onUnmounted(() => {
  if (monitorTimer) {
    clearInterval(monitorTimer)
  }
})
</script>

<style scoped>
.system-monitor {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.monitor-section {
  margin-bottom: 20px;
}

.metric-card {
  height: 120px;
  transition: all 0.3s ease;
}

.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.metric-card.normal {
  border-left: 4px solid #67c23a;
}

.metric-card.warning {
  border-left: 4px solid #e6a23c;
}

.metric-card.danger {
  border-left: 4px solid #f56c6c;
}

.metric-content {
  display: flex;
  align-items: center;
  height: 100%;
}

.metric-icon {
  margin-right: 16px;
  color: #409eff;
}

.metric-info {
  flex: 1;
}

.metric-value {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
  margin-bottom: 4px;
}

.metric-label {
  font-size: 14px;
  color: #909399;
}

.monitor-card {
  height: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chart-container {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 20px 0;
}

.chart-info p {
  margin: 8px 0;
  color: #606266;
  font-size: 14px;
}

.disk-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.disk-item {
  padding: 12px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
}

.disk-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.disk-name {
  font-weight: bold;
  color: #303133;
}

.disk-size {
  color: #909399;
  font-size: 14px;
}

.disk-details {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}

.network-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.network-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.network-item:last-child {
  border-bottom: none;
}

.network-label {
  color: #606266;
}

.network-value {
  font-weight: bold;
  color: #303133;
}

.chart-placeholder {
  text-align: center;
  padding: 40px 0;
}

.chart-placeholder p {
  color: #909399;
  margin-top: 16px;
}
</style>
