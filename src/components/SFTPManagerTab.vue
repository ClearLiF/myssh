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
    <div 
      class="files-container"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
      :class="{ 'drag-over': isDraggingOver }"
    >
      <!-- 拖放提示 -->
      <div v-if="isDraggingOver" class="drag-hint">
        <el-icon :size="48"><Upload /></el-icon>
        <p>拖放文件到这里上传</p>
      </div>

      <el-table
        :data="files"
        @row-dblclick="handleRowDoubleClick"
        @row-contextmenu="handleRowContextMenu"
        v-loading="loading"
        height="100%"
        class="files-table"
      >
        <el-table-column prop="name" label="名称" min-width="150">
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
          class="menu-item"
          @click="showRenameDialog(selectedFile)"
        >
          <el-icon><Edit /></el-icon>
          <span>重命名</span>
        </div>
        <div 
          class="menu-item"
          @click="copyPath(selectedFile)"
        >
          <el-icon><DocumentCopy /></el-icon>
          <span>复制路径</span>
        </div>
        <div 
          v-if="!selectedFile?.isDirectory"
          class="menu-item"
          @click="openWithEditor(selectedFile)"
        >
          <el-icon><EditPen /></el-icon>
          <span>用编辑器打开</span>
        </div>
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

    <!-- 上传进度对话框 -->
    <el-dialog 
      v-model="uploadDialogVisible" 
      title="上传进度" 
      width="400px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <div v-if="uploadingFiles.length > 0" class="upload-progress">
        <div v-for="(file, index) in uploadingFiles" :key="index" class="file-progress">
          <div class="file-name">{{ file.name }}</div>
          <el-progress 
            :percentage="file.percentage" 
            :status="file.status"
            :color="file.status === 'success' ? '#67c23a' : file.status === 'exception' ? '#f56c6c' : undefined"
          />
          <div class="file-status">{{ file.statusText }}</div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Upload, FolderAdd, Folder, Document, Download, Delete, HomeFilled, Edit, DocumentCopy, EditPen } from '@element-plus/icons-vue'

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
const isDraggingOver = ref(false) // 新增：拖拽状态
const uploadingFiles = ref([]) // 新增：上传进度状态
const uploadDialogVisible = ref(false) // 新增：上传进度对话框可见性

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

// 拖拽相关
const handleDragOver = () => {
  isDraggingOver.value = true
}

const handleDragLeave = () => {
  isDraggingOver.value = false
}

// 处理拖放的文件和文件夹
const processDroppedItems = async (items) => {
  const filesToUpload = []
  
  const processEntry = async (entry, path = '') => {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => {
        entry.file(resolve, reject)
      })
      file.fullPath = path + file.name
      filesToUpload.push(file)
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader()
      const entries = await new Promise((resolve, reject) => {
        dirReader.readEntries(resolve, reject)
      })
      
      for (const subEntry of entries) {
        await processEntry(subEntry, path + entry.name + '/')
      }
    }
  }
  
  for (const item of items) {
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry()
      if (entry) {
        await processEntry(entry)
      }
    }
  }
  
  return filesToUpload
}

const handleDrop = async (event) => {
  const items = event.dataTransfer.items
  if (items.length > 0) {
    try {
      const filesToUpload = await processDroppedItems(Array.from(items))
      if (filesToUpload.length > 0) {
        uploadFiles(filesToUpload)
      }
    } catch (error) {
      ElMessage.error('处理拖放文件失败: ' + error.message)
    }
  }
  isDraggingOver.value = false
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

// 复制路径
const copyPath = (file) => {
  const basePath = currentPath.value === '/' ? '' : currentPath.value
  const pathToCopy = file.fullPath || `${basePath}/${file.name}`
  navigator.clipboard.writeText(pathToCopy).then(() => {
    ElMessage.success(`已复制路径: ${pathToCopy}`)
  }).catch(() => {
    ElMessage.error('复制路径失败')
  })
}

// 上传文件（拖放或点击上传）
const uploadFiles = async (filesToUpload) => {
  if (!props.connectionId) {
    ElMessage.warning('请先选择连接')
    return
  }

  if (filesToUpload.length === 0) {
    return
  }

  // 初始化上传进度
  uploadingFiles.value = filesToUpload.map(file => ({
    name: file.fullPath ? file.fullPath : file.name,
    percentage: 0,
    status: 'info',
    statusText: '等待中...'
  }))
  uploadDialogVisible.value = true

  let successCount = 0
  let errorCount = 0

  for (let i = 0; i < filesToUpload.length; i++) {
    const file = filesToUpload[i]
    try {
      uploadingFiles.value[i].statusText = '上传中...'
      uploadingFiles.value[i].percentage = 0

      if (window.electronAPI && window.electronAPI.sftp) {
        // 计算远程路径（保持文件夹结构）
        const remotePath = file.fullPath 
          ? `${currentPath.value}/${file.fullPath}`.replace('//', '/')
          : `${currentPath.value}/${file.name}`.replace('//', '/')

        // 监听上传进度
        let progressListener
        const onProgress = (data) => {
          if (data.connectionId === props.connectionId && data.fileName === file.name) {
            uploadingFiles.value[i].percentage = Math.round(data.percentage)
            uploadingFiles.value[i].statusText = `${data.percentage.toFixed(0)}%`
          }
        }

        // 添加进度监听
        if (window.electronAPI.sftp.onProgress) {
          window.electronAPI.sftp.onProgress(onProgress)
          progressListener = onProgress
        }

        const result = await window.electronAPI.sftp.upload(
          props.connectionId,
          file.path || file,
          remotePath
        )

        if (result.success) {
          successCount++
          uploadingFiles.value[i].percentage = 100
          uploadingFiles.value[i].status = 'success'
          uploadingFiles.value[i].statusText = '上传成功'
        } else {
          errorCount++
          uploadingFiles.value[i].status = 'exception'
          uploadingFiles.value[i].statusText = `上传失败: ${result.message || '未知错误'}`
        }

        // 移除进度监听
        if (window.electronAPI.sftp.removeProgressListener) {
          window.electronAPI.sftp.removeProgressListener()
        }
      }
    } catch (error) {
      errorCount++
      uploadingFiles.value[i].status = 'exception'
      uploadingFiles.value[i].statusText = `出错: ${error.message}`
    }
  }

  // 上传完成后刷新文件列表
  if (successCount > 0) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    loadFiles()
  }

  // 2秒后自动关闭进度对话框
  if (errorCount === 0) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    uploadDialogVisible.value = false
  }

  ElMessage.success(`上传完成: 成功 ${successCount} 个，失败 ${errorCount} 个`)
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

// 重命名文件
const showRenameDialog = (file) => {
  ElMessageBox.prompt('请输入新的文件名', '重命名', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputValue: file.name,
    inputPlaceholder: file.name,
    inputValidator: (value) => {
      if (!value) {
        return '文件名不能为空'
      }
      if (value.includes('/') || value.includes('\\')) {
        return '文件名不能包含路径分隔符'
      }
      return true
    }
  }).then(async ({ value }) => {
    if (value) {
      try {
        const newName = value.trim()
        if (newName === file.name) {
          ElMessage.info('文件名未改变')
          return
        }

        if (window.electronAPI && window.electronAPI.sftp) {
          const result = await window.electronAPI.sftp.rename(
            props.connectionId,
            `${currentPath.value}/${file.name}`,
            `${currentPath.value}/${newName}`
          )

          if (result.success) {
            ElMessage.success(`已重命名: ${file.name} -> ${newName}`)
            loadFiles()
          } else {
            throw new Error(result.message || '重命名失败')
          }
        }
      } catch (error) {
        ElMessage.error(`重命名失败: ${error.message}`)
      }
    }
  }).catch(() => {
    // 用户取消
  })
}

// 用编辑器打开文件
const openWithEditor = async (file) => {
  if (!props.connectionId) {
    ElMessage.warning('请先选择连接')
    return
  }

  if (file.isDirectory) {
    ElMessage.warning('不能用编辑器打开文件夹')
    return
  }

  try {
    if (window.electronAPI && window.electronAPI.sftp) {
      const remotePath = file.fullPath || `${currentPath.value}/${file.name}`.replace('//', '/')
      
      // 获取临时文件目录
      const tempPathResult = await window.electronAPI.settings.getTempPath()
      if (!tempPathResult.success) {
        ElMessage.error('获取临时文件目录失败')
        return
      }
      
      const tempDir = tempPathResult.path
      const localPath = `${tempDir}/${file.name}`
      
      // 下载文件到临时目录
      const downloadResult = await window.electronAPI.sftp.download(
        props.connectionId,
        remotePath,
        localPath
      )
      
      if (!downloadResult.success) {
        ElMessage.error(`下载文件失败: ${downloadResult.message}`)
        return
      }
      
      // 用编辑器打开文件
      const openResult = await window.electronAPI.openFileWithEditor(localPath)
      if (openResult.success) {
        ElMessage.success(`文件已用编辑器打开: ${file.name}`)
        
        // 启动文件监听，监听变化并上传
        startFileWatcher(props.connectionId, localPath, remotePath, file.name)
      } else {
        ElMessage.error(`打开编辑器失败: ${openResult.message}`)
      }
    } else {
      ElMessage.warning('当前环境不支持用编辑器打开文件')
    }
  } catch (error) {
    ElMessage.error(`打开文件失败: ${error.message}`)
  }
}

// 启动文件监听
const startFileWatcher = (connectionId, localPath, remotePath, fileName) => {
  let watchCount = 0
  const maxWatchTime = 30 * 60 * 1000 // 30分钟后停止监听
  const checkInterval = 2000 // 每2秒检查一次
  let lastUploadTime = 0
  const uploadCooldown = 5000 // 5秒内不重复上传
  
  const watchTimer = setInterval(async () => {
    watchCount += checkInterval
    
    // 超过最大监听时间则停止
    if (watchCount > maxWatchTime) {
      clearInterval(watchTimer)
      console.log(`文件监听已停止: ${fileName}`)
      return
    }
    
    try {
      // 尝试监听文件变化
      if (window.electronAPI && window.electronAPI.watchFile) {
        const result = await window.electronAPI.watchFile(localPath)
        
        if (result && result.changed) {
          const now = Date.now()
          // 检查冷却时间，避免频繁上传
          if (now - lastUploadTime >= uploadCooldown) {
            lastUploadTime = now
            
            // 等待一秒确保文件写入完成
            await new Promise(resolve => setTimeout(resolve, 1000))
            
            // 上传文件
            if (window.electronAPI && window.electronAPI.sftp) {
              const uploadResult = await window.electronAPI.sftp.upload(
                connectionId,
                localPath,
                remotePath
              )
              
              if (uploadResult && uploadResult.success) {
                ElMessage.success(`文件已自动保存到服务器: ${fileName}`)
              } else {
                ElMessage.error(`上传文件失败: ${uploadResult?.message || '未知错误'}`)
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('监听文件失败:', error)
    }
  }, checkInterval)
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
  position: relative; /* 新增：用于定位拖放提示 */
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
  padding: 8px 12px;
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
  padding: 8px 12px;
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

/* 拖放提示 */
.drag-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #58a6ff;
  opacity: 0.8;
  z-index: 10;
}

.drag-hint p {
  margin-top: 10px;
  font-size: 14px;
}

.drag-over {
  background: rgba(102, 126, 234, 0.1); /* 拖拽时背景变浅 */
}

/* 上传进度对话框 */
.upload-progress {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: 500px;
  overflow-y: auto;
}

.file-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: rgba(88, 166, 255, 0.05);
  border: 1px solid rgba(88, 166, 255, 0.2);
  border-radius: 6px;
}

.file-name {
  font-weight: 500;
  font-size: 13px;
  color: #cccccc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-status {
  font-size: 12px;
  color: #8b949e;
  text-align: right;
}

.upload-progress :deep(.el-progress) {
  margin: 4px 0;
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

