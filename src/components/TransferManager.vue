<template>
  <!-- 浮动按钮 -->
  <div class="transfer-button" @click="togglePanel" :title="activeTasksCount > 0 ? `正在传输 ${activeTasksCount} 个文件` : '传输历史'">
    <el-badge :value="activeTasksCount" :hidden="activeTasksCount === 0" type="primary">
      <div class="button-icon">
        <el-icon :size="24">
          <Upload v-if="activeTasksCount > 0" class="rotating" />
          <Clock v-else />
        </el-icon>
      </div>
    </el-badge>
    <div class="button-label">传输</div>
  </div>

  <!-- 传输面板 -->
  <transition name="slide-fade">
    <div 
      v-if="isPanelVisible" 
      class="transfer-panel"
      @click.stop
    >
      <!-- 标题栏 -->
      <div class="panel-header">
        <div class="header-left">
          <el-icon :size="18"><FolderOpened /></el-icon>
          <span class="header-title">传输管理</span>
        </div>
        <div class="header-right">
          <el-button 
            text 
            :icon="Close" 
            size="small"
            @click="togglePanel"
            title="关闭"
          />
        </div>
      </div>

      <!-- 标签页 -->
      <el-tabs v-model="activeTab" class="transfer-tabs">
        <!-- 当前任务 -->
        <el-tab-pane name="current">
          <template #label>
            <span>当前任务 <el-tag v-if="activeTasksCount > 0" type="primary" size="small">{{ activeTasksCount }}</el-tag></span>
          </template>
          
          <div class="tasks-list">
            <div v-if="tasks.length === 0" class="empty-state">
              <el-empty description="暂无传输任务" :image-size="80" />
            </div>
            
            <div 
              v-for="task in tasks" 
              :key="task.id" 
              class="task-item"
              :class="{ 'completed': task.status === 'success', 'failed': task.status === 'error' }"
            >
              <div class="task-icon">
                <el-icon v-if="task.type === 'upload'" :size="20" color="#409eff"><Upload /></el-icon>
                <el-icon v-else :size="20" color="#67c23a"><Download /></el-icon>
              </div>
              
              <div class="task-info">
                <div class="task-name">{{ task.name }}</div>
                <div class="task-details">
                  <span class="task-size">{{ formatSize(task.currentSize) }} / {{ formatSize(task.totalSize) }}</span>
                  <span class="task-speed" v-if="task.status === 'uploading' && task.speed > 0">{{ formatSpeed(task.speed) }}</span>
                </div>
                <el-progress 
                  :percentage="task.percentage" 
                  :status="task.status === 'success' ? 'success' : (task.status === 'error' ? 'exception' : undefined)"
                  :show-text="false"
                />
              </div>

              <div class="task-actions">
                <el-button 
                  v-if="task.status === 'success' || task.status === 'error'" 
                  text 
                  :icon="Delete" 
                  size="small"
                  @click="removeTask(task)"
                  title="移除"
                />
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- 历史记录 -->
        <el-tab-pane name="history">
          <template #label>
            <span>历史记录 <el-tag v-if="history.length > 0" type="info" size="small">{{ history.length }}</el-tag></span>
          </template>
          
          <div class="history-list">
            <div class="history-toolbar">
              <el-input 
                v-model="historySearch" 
                placeholder="搜索文件名..." 
                size="small"
                clearable
                :prefix-icon="Search"
                style="flex: 1;"
              />
              <el-button 
                size="small" 
                @click="clearHistory"
                :icon="Delete"
              >
                清空
              </el-button>
            </div>

            <div v-if="filteredHistory.length === 0" class="empty-state">
              <el-empty description="暂无历史记录" :image-size="80" />
            </div>

            <div 
              v-for="record in filteredHistory" 
              :key="record.id" 
              class="history-item"
              @contextmenu.prevent="showContextMenu($event, record)"
            >
              <div class="history-icon">
                <el-icon v-if="record.type === 'upload'" :size="18" color="#409eff"><Upload /></el-icon>
                <el-icon v-else :size="18" color="#67c23a"><Download /></el-icon>
              </div>
              
              <div class="history-info">
                <div class="history-name">{{ record.name }}</div>
                <div class="history-details">
                  <span class="history-size">{{ formatSize(record.size) }}</span>
                  <span class="history-time">{{ formatDate(record.timestamp) }}</span>
                  <el-tag 
                    :type="record.status === 'success' ? 'success' : 'danger'" 
                    size="small"
                    effect="plain"
                  >
                    {{ record.status === 'success' ? '成功' : '失败' }}
                  </el-tag>
                </div>
                <div class="history-path" :title="record.path">
                  <el-icon :size="12"><Folder /></el-icon>
                  {{ record.path }}
                </div>
                <div v-if="record.localPath" class="history-local-path" :title="record.localPath">
                  <el-icon :size="12"><Monitor /></el-icon>
                  {{ record.localPath }}
                </div>
              </div>

              <div class="history-actions">
                <el-button 
                  v-if="record.type === 'download' && record.localPath" 
                  text 
                  :icon="FolderOpened" 
                  size="small"
                  @click="openLocalFile(record.localPath)"
                  title="打开本地文件"
                />
                <el-button 
                  text 
                  :icon="Delete" 
                  size="small"
                  @click="removeHistory(record)"
                  title="删除记录"
                />
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <!-- 底部统计 -->
      <div class="panel-footer" v-if="tasks.length > 0">
        <div class="footer-stats">
          <span>总速度: {{ formatSpeed(totalSpeed) }}</span>
          <span>{{ activeTasksCount }} / {{ tasks.length }} 进行中</span>
        </div>
      </div>
    </div>
  </transition>

  <!-- 右键菜单 -->
  <div 
    v-if="contextMenuVisible" 
    class="context-menu"
    :style="{ top: contextMenuY + 'px', left: contextMenuX + 'px' }"
    @click="contextMenuVisible = false"
  >
    <div 
      v-if="contextMenuRecord && contextMenuRecord.type === 'download' && contextMenuRecord.localPath"
      class="context-menu-item"
      @click="openLocalFile(contextMenuRecord.localPath)"
    >
      <el-icon><FolderOpened /></el-icon>
      <span>打开本地文件</span>
    </div>
    <div 
      v-if="contextMenuRecord && contextMenuRecord.type === 'download' && contextMenuRecord.localPath"
      class="context-menu-item"
      @click="showInFolder(contextMenuRecord.localPath)"
    >
      <el-icon><Folder /></el-icon>
      <span>在文件夹中显示</span>
    </div>
    <div 
      class="context-menu-item"
      @click="copyPath(contextMenuRecord)"
    >
      <el-icon><DocumentCopy /></el-icon>
      <span>复制路径</span>
    </div>
    <div 
      class="context-menu-item danger"
      @click="removeHistory(contextMenuRecord)"
    >
      <el-icon><Delete /></el-icon>
      <span>删除记录</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { 
  Upload, Download, Close, Clock, Delete, 
  FolderOpened, Search, Folder, Monitor, DocumentCopy
} from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'

const isPanelVisible = ref(false)
const activeTab = ref('current')
const historySearch = ref('')

// 任务列表
const tasks = ref([])

// 历史记录
const history = ref([])

// 右键菜单
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuRecord = ref(null)
const toastRef = ref(null)

// 当前活跃任务数
const activeTasksCount = computed(() => {
  return tasks.value.filter(t => t.status === 'uploading' || t.status === 'processing').length
})

// 总速度
const totalSpeed = computed(() => {
  return tasks.value
    .filter(t => t.status === 'uploading')
    .reduce((sum, t) => sum + (t.speed || 0), 0)
})

// 过滤后的历史记录
const filteredHistory = computed(() => {
  if (!historySearch.value) return history.value
  
  const keyword = historySearch.value.toLowerCase()
  return history.value.filter(h => 
    h.name.toLowerCase().includes(keyword) || 
    h.path.toLowerCase().includes(keyword)
  )
})

// 切换面板显示/隐藏
const togglePanel = () => {
  isPanelVisible.value = !isPanelVisible.value
}

// 添加任务
const addTask = (task) => {
  const newTask = {
    id: Date.now() + Math.random(),
    name: task.name,
    type: task.type, // 'upload' or 'download'
    totalSize: task.totalSize || 0,
    currentSize: 0,
    percentage: 0,
    speed: 0,
    status: task.status || 'uploading', // 'uploading', 'processing', 'success', 'error'
    path: task.path,
    localPath: task.localPath, // 下载任务的本地路径
    startTime: Date.now(),
    lastUpdateTime: Date.now(),
    lastSize: 0
  }
  
  tasks.value.push(newTask)
  
  // 如果面板未打开且有活跃任务，自动打开面板
  if (!isPanelVisible.value && activeTasksCount.value > 0) {
    isPanelVisible.value = true
  }
  
  return newTask.id
}

// 更新任务进度
const updateTask = (taskId, update) => {
  const task = tasks.value.find(t => t.id === taskId)
  if (!task) return
  
  const now = Date.now()
  const timeDiff = (now - task.lastUpdateTime) / 1000 // 秒
  
  if (update.currentSize !== undefined) {
    const sizeDiff = update.currentSize - task.lastSize
    task.speed = timeDiff > 0.5 ? sizeDiff / timeDiff : task.speed
    task.lastSize = update.currentSize
    task.currentSize = update.currentSize
  }
  
  if (update.percentage !== undefined) {
    task.percentage = Math.min(100, Math.max(0, update.percentage))
  }
  
  if (update.status !== undefined) {
    task.status = update.status
    
    // 任务完成，添加到历史记录
    if (update.status === 'success' || update.status === 'error') {
      addToHistory(task)
      
      // 5秒后自动移除完成的任务
      setTimeout(() => {
        removeTask(task)
      }, 5000)
    }
  }
  
  task.lastUpdateTime = now
}

// 添加到历史记录
const addToHistory = (task) => {
  history.value.unshift({
    id: Date.now() + Math.random(),
    name: task.name,
    type: task.type,
    size: task.totalSize,
    path: task.path,
    localPath: task.localPath, // 保存本地路径
    status: task.status === 'success' ? 'success' : 'error',
    timestamp: Date.now()
  })
  
  // 只保留最近200条记录
  if (history.value.length > 200) {
    history.value = history.value.slice(0, 200)
  }
  
  // 保存到本地存储
  saveHistory()
}

// 移除任务
const removeTask = (task) => {
  const index = tasks.value.findIndex(t => t.id === task.id)
  if (index > -1) {
    tasks.value.splice(index, 1)
  }
}

// 移除历史记录
const removeHistory = (record) => {
  const index = history.value.findIndex(h => h.id === record.id)
  if (index > -1) {
    history.value.splice(index, 1)
    saveHistory()
  }
  contextMenuVisible.value = false
}

// 清空历史记录
const clearHistory = () => {
  ElMessageBox.confirm(
    '确定要清空所有历史记录吗？',
    '确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    history.value = []
    saveHistory()
  }).catch(() => {})
}

// 显示右键菜单
const showContextMenu = (event, record) => {
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  contextMenuRecord.value = record
  contextMenuVisible.value = true
}

// 点击其他地方关闭右键菜单和传输面板
const handleClickOutside = (event) => {
  // 关闭右键菜单
  if (contextMenuVisible.value) {
    contextMenuVisible.value = false
  }
  
  // 关闭传输面板（如果点击的不是传输面板内部）
  if (isPanelVisible.value) {
    // 检查点击的元素是否在传输面板内部
    const transferPanel = event.target.closest('.transfer-panel')
    const transferButton = event.target.closest('.transfer-button')
    
    // 如果点击的不是传输面板内部也不是传输按钮，则关闭面板
    if (!transferPanel && !transferButton) {
      isPanelVisible.value = false
    }
  }
}

// 打开本地文件
const openLocalFile = async (localPath) => {
  if (window.electronAPI && window.electronAPI.openFileWithEditor) {
    const result = await window.electronAPI.openFileWithEditor(localPath)
    if (!result.success) {
      console.error('打开文件失败:', result.message)
    }
  }
  contextMenuVisible.value = false
}

// 在文件夹中显示
const showInFolder = async (localPath) => {
  if (window.electronAPI && window.electronAPI.system && window.electronAPI.system.showItemInFolder) {
    await window.electronAPI.system.showItemInFolder(localPath)
  } else {
    // 如果没有专用API，尝试打开所在文件夹
    const folder = localPath.substring(0, localPath.lastIndexOf('/'))
    openLocalFile(folder)
  }
  contextMenuVisible.value = false
}

// 复制路径
const copyPath = (record) => {
  const path = record.type === 'download' && record.localPath ? record.localPath : record.path
  navigator.clipboard.writeText(path).then(() => {
    console.log('路径已复制:', path)
  })
  contextMenuVisible.value = false
}

// 格式化大小
const formatSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i]
}

// 格式化速度
const formatSpeed = (bytesPerSecond) => {
  if (!bytesPerSecond || bytesPerSecond === 0) return '0 B/s'
  return formatSize(bytesPerSecond) + '/s'
}

// 格式化日期
const formatDate = (timestamp) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 保存历史记录到本地存储
const saveHistory = () => {
  try {
    localStorage.setItem('transfer_history', JSON.stringify(history.value))
  } catch (error) {
    console.error('保存历史记录失败:', error)
  }
}

// 加载历史记录
const loadHistory = () => {
  try {
    const saved = localStorage.getItem('transfer_history')
    if (saved) {
      history.value = JSON.parse(saved)
    }
  } catch (error) {
    console.error('加载历史记录失败:', error)
    history.value = []
  }
}

// 组件加载时恢复历史记录
onMounted(() => {
  loadHistory()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// 暴露方法给父组件
defineExpose({
  addTask,
  updateTask,
  removeTask,
  togglePanel
})
</script>

<style scoped>
/* 浮动按钮 */
.transfer-button {
  position: fixed;
  bottom: 80px;
  right: 20px;
  width: 64px;
  height: 64px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  z-index: 9998;
  color: white;
}

.transfer-button:hover {
  transform: translateY(-4px) scale(1.05);
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.6);
}

.transfer-button:active {
  transform: translateY(-2px) scale(1.02);
}

.button-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.button-label {
  font-size: 11px;
  font-weight: 500;
  margin-top: 2px;
}

.rotating {
  animation: rotate 2s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 传输面板 */
.transfer-panel {
  position: fixed;
  bottom: 20px;
  right: 100px;
  width: 480px;
  max-height: calc(100vh - 100px);
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(10px);
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-right {
  display: flex;
  gap: 4px;
}

/* 标签页 */
.transfer-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.transfer-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.transfer-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow-y: auto;
  max-height: 500px;
}

.transfer-tabs :deep(.el-tab-pane) {
  height: 100%;
}

/* 任务列表 */
.tasks-list {
  padding: 12px;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  transition: all 0.3s ease;
}

.task-item:hover {
  background: var(--hover-bg);
  border-color: var(--accent-color);
}

.task-item.completed {
  opacity: 0.7;
}

.task-item.failed {
  border-color: #f56c6c;
}

.task-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.task-info {
  flex: 1;
  min-width: 0;
}

.task-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-details {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.task-speed {
  color: #409eff;
  font-weight: 500;
}

.task-actions {
  display: flex;
  gap: 4px;
}

/* 历史记录列表 */
.history-list {
  padding: 12px;
}

.history-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 0 0 12px;
}

.history-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  transition: all 0.2s ease;
  cursor: pointer;
}

.history-item:hover {
  background: var(--hover-bg);
  border-color: var(--accent-color);
}

.history-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary);
  border-radius: 6px;
}

.history-info {
  flex: 1;
  min-width: 0;
}

.history-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-details {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.history-path,
.history-local-path {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.history-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

/* 底部统计 */
.panel-footer {
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
}

.footer-stats {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
}

/* 空状态 */
.empty-state {
  padding: 60px 20px;
  text-align: center;
}

/* 右键菜单 */
.context-menu {
  position: fixed;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  padding: 4px;
  z-index: 10000;
  min-width: 180px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 13px;
  border-radius: 4px;
  transition: all 0.2s ease;
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

/* 动画 */
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.2s ease-in;
}

.slide-fade-enter-from {
  transform: translateX(20px);
  opacity: 0;
}

.slide-fade-leave-to {
  transform: translateX(20px);
  opacity: 0;
}

/* 滚动条 */
:deep(.el-tabs__content)::-webkit-scrollbar {
  width: 6px;
}

:deep(.el-tabs__content)::-webkit-scrollbar-track {
  background: var(--bg-secondary);
}

:deep(.el-tabs__content)::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

:deep(.el-tabs__content)::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}
</style>
