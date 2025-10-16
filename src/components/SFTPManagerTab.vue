<template>
  <div class="sftp-manager-tab">
    <!-- 文件管理器工具栏 -->
    <div class="sftp-toolbar">
      <div class="toolbar-left">
        <el-breadcrumb separator="/">
          <el-breadcrumb-item
            @click="navigateToRoot"
            class="path-item root-item"
          >
            <el-icon><HomeFilled /></el-icon>
            <span>root</span>
          </el-breadcrumb-item>
          <el-breadcrumb-item
            v-for="(part, index) in pathParts"
            :key="index"
            @click="navigateToPath(index)"
            class="path-item"
          >
            {{ part }}
          </el-breadcrumb-item>
        </el-breadcrumb>
      </div>
      <div class="toolbar-right">
        <el-button size="small" @click="refreshFiles" :loading="loading">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button size="small" @click="showUploadDialog">
          <el-icon><Upload /></el-icon>
          上传
        </el-button>
        <el-button size="small" @click="showNewFolderDialog">
          <el-icon><FolderAdd /></el-icon>
          新建文件夹
        </el-button>
      </div>
    </div>

    <!-- 文件列表 -->
    <div class="files-container">
      <el-table
        :data="files"
        @row-dblclick="handleRowDoubleClick"
        @row-contextmenu="handleRowContextMenu"
        v-loading="loading"
        height="100%"
        class="files-table"
      >
        <el-table-column prop="name" label="名称" min-width="200">
          <template #default="{ row }">
            <div class="file-name">
              <el-icon :size="18" :color="row.isDirectory ? '#58a6ff' : '#8b949e'">
                <Folder v-if="row.isDirectory" />
                <Document v-else />
              </el-icon>
              <span>{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="size" label="大小" width="120">
          <template #default="{ row }">
            {{ row.isDirectory ? '-' : formatFileSize(row.size) }}
          </template>
        </el-table-column>
        <el-table-column prop="modifiedTime" label="修改时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.modifiedTime) }}
          </template>
        </el-table-column>
      </el-table>

      <!-- 右键菜单 -->
      <div 
        v-if="contextMenuVisible" 
        class="context-menu"
        :style="{ top: contextMenuY + 'px', left: contextMenuX + 'px' }"
        @click="closeContextMenu"
      >
        <div 
          v-if="!selectedFile?.isDirectory" 
          class="menu-item"
          @click="downloadFile(selectedFile)"
        >
          <el-icon><Download /></el-icon>
          <span>下载</span>
        </div>
        <div 
          class="menu-item danger"
          @click="deleteFile(selectedFile)"
        >
          <el-icon><Delete /></el-icon>
          <span>删除</span>
        </div>
        <div class="menu-divider"></div>
        <div class="menu-item" @click="refreshFiles">
          <el-icon><Refresh /></el-icon>
          <span>刷新</span>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!loading && files.length === 0" class="empty-files">
      <el-empty description="此目录为空" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Upload, FolderAdd, Folder, Document, Download, Delete, HomeFilled } from '@element-plus/icons-vue'

const props = defineProps({
  connection: {
    type: Object,
    required: true
  },
  connectionId: {
    type: String,
    default: null
  },
  tabMode: {
    type: Boolean,
    default: false
  }
})

const currentPath = ref('/')
const files = ref([])
const loading = ref(false)
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const selectedFile = ref(null)

// 路径分割
const pathParts = computed(() => {
  return currentPath.value.split('/').filter(p => p)
})

// 格式化文件大小
const formatFileSize = (bytes) => {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

// 格式化时间
const formatTime = (time) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

// 加载文件列表
const loadFiles = async () => {
  if (!props.connectionId) {
    ElMessage.warning('请先建立 SSH 连接')
    return
  }

  loading.value = true
  
  try {
    if (window.electronAPI) {
      const result = await window.electronAPI.sftp.list(
        props.connectionId,
        currentPath.value
      )
      
      if (result.success) {
        files.value = result.files.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })
      } else {
        throw new Error(result.message)
      }
    } else {
      // 模拟数据
      await new Promise(resolve => setTimeout(resolve, 500))
      files.value = [
        { name: 'folder1', isDirectory: true, size: 0, modifiedTime: new Date() },
        { name: 'folder2', isDirectory: true, size: 0, modifiedTime: new Date() },
        { name: 'file1.txt', isDirectory: false, size: 1024, modifiedTime: new Date() },
        { name: 'file2.log', isDirectory: false, size: 2048, modifiedTime: new Date() }
      ]
    }
  } catch (error) {
    ElMessage.error(`加载文件列表失败: ${error.message}`)
    files.value = []
  } finally {
    loading.value = false
  }
}

// 刷新文件列表
const refreshFiles = () => {
  loadFiles()
}

// 双击行
const handleRowDoubleClick = (row) => {
  if (row.isDirectory) {
    currentPath.value = currentPath.value === '/' 
      ? `/${row.name}`
      : `${currentPath.value}/${row.name}`
    loadFiles()
  }
}

// 右键菜单
const handleRowContextMenu = (row, column, event) => {
  event.preventDefault()
  selectedFile.value = row
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  contextMenuVisible.value = true
}

// 关闭右键菜单
const closeContextMenu = () => {
  contextMenuVisible.value = false
}

// 点击其他地方关闭右键菜单
const handleClickOutside = (event) => {
  if (contextMenuVisible.value) {
    closeContextMenu()
  }
}

// 回到根目录
const navigateToRoot = () => {
  currentPath.value = '/'
  loadFiles()
}

// 导航到指定路径
const navigateToPath = (index) => {
  const parts = pathParts.value.slice(0, index + 1)
  currentPath.value = '/' + parts.join('/')
  loadFiles()
}

// 上传文件对话框
const showUploadDialog = () => {
  ElMessage.info('上传功能开发中...')
}

// 新建文件夹对话框
const showNewFolderDialog = () => {
  ElMessage.info('新建文件夹功能开发中...')
}

// 下载文件
const downloadFile = (file) => {
  ElMessage.info(`下载文件: ${file.name}`)
}

// 删除文件
const deleteFile = async (file) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除 "${file.name}" 吗？`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    ElMessage.success(`已删除: ${file.name}`)
    loadFiles()
  } catch {
    // 用户取消
  }
}

// 监听连接ID变化
watch(() => props.connectionId, (newId) => {
  if (newId) {
    loadFiles()
  }
}, { immediate: true })

onMounted(() => {
  if (props.connectionId) {
    loadFiles()
  }
  // 添加全局点击事件监听
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  // 移除全局点击事件监听
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.sftp-manager-tab {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #161b22 0%, #1a1f26 100%);
}

.sftp-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: linear-gradient(135deg, rgba(22, 27, 34, 0.95) 0%, rgba(26, 31, 38, 0.95) 100%);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(48, 54, 61, 0.5);
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.toolbar-left {
  flex: 1;
  min-width: 0;
}

.toolbar-left :deep(.el-breadcrumb) {
  font-size: 13px;
}

.toolbar-left :deep(.el-breadcrumb__item) {
  color: #cccccc;
}

.path-item {
  cursor: pointer;
}

.path-item:hover {
  color: #409eff;
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

.files-container {
  flex: 1;
  overflow: hidden;
}

.files-table {
  background: transparent !important;
  font-size: 13px;
}

.files-table :deep(.el-table__inner-wrapper) {
  background: transparent !important;
}

.files-table :deep(.el-table__header-wrapper) {
  background: transparent !important;
}

.files-table :deep(.el-table__body-wrapper) {
  background: transparent !important;
}

.files-table :deep(.el-table__header) {
  background: transparent !important;
}

.files-table :deep(.el-table__header th) {
  background: transparent !important;
  color: #8b949e !important;
  border-color: rgba(48, 54, 61, 0.3) !important;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 14px 16px;
}

.files-table :deep(.el-table__body) {
  background: transparent !important;
}

.files-table :deep(.el-table__body tr) {
  background: transparent !important;
  color: #c9d1d9 !important;
  transition: all 0.2s;
}

.files-table :deep(.el-table__body tr:hover > td) {
  background: rgba(102, 126, 234, 0.08) !important;
  cursor: pointer;
}

.files-table :deep(.el-table__body td) {
  background: transparent !important;
  border-color: rgba(48, 54, 61, 0.3) !important;
  padding: 12px 16px;
  color: #c9d1d9 !important;
}

.files-table :deep(.el-table__empty-block) {
  background: transparent !important;
}

.files-table :deep(.el-loading-mask) {
  background: rgba(22, 27, 34, 0.8) !important;
}

.file-name {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.file-name .el-icon {
  transition: transform 0.2s;
}

.files-table :deep(tr:hover) .file-name .el-icon {
  transform: scale(1.1);
}

.empty-files {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(22, 27, 34, 0.3);
}

.toolbar-left :deep(.el-breadcrumb__item) {
  font-weight: 500;
}

.toolbar-left :deep(.el-breadcrumb__separator) {
  color: #8b949e;
}

.path-item {
  cursor: pointer;
  transition: all 0.2s;
}

.path-item:hover {
  color: #58a6ff !important;
}

.root-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.root-item .el-icon {
  font-size: 14px;
}

/* 右键菜单 */
.context-menu {
  position: fixed;
  background: linear-gradient(135deg, rgba(45, 45, 48, 0.98) 0%, rgba(37, 37, 38, 0.98) 100%);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 8px;
  padding: 6px;
  min-width: 160px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 9999;
  animation: fadeIn 0.15s ease-out;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  color: #c9d1d9;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.menu-item:hover {
  background: rgba(102, 126, 234, 0.15);
  color: #ffffff;
}

.menu-item.danger {
  color: #ff7b72;
}

.menu-item.danger:hover {
  background: rgba(255, 123, 114, 0.15);
  color: #ff7b72;
}

.menu-item .el-icon {
  font-size: 16px;
}

.menu-divider {
  height: 1px;
  background: rgba(48, 54, 61, 0.5);
  margin: 6px 0;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>

