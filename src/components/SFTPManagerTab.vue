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
        <el-button 
          size="small" 
          :type="folderUploadMode === 'compress' ? 'primary' : ''"
          @click="toggleFolderUploadMode"
          title="切换文件夹上传方式"
        >
          <el-icon><Box /></el-icon>
          {{ folderUploadMode === 'compress' ? '压缩上传' : '直接上传' }}
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
        <p class="drag-hint-mode">文件夹上传模式: {{ folderUploadMode === 'compress' ? '压缩上传（快速）' : '直接上传（保留结构）' }}</p>
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

    <!-- 传输管理器 -->
    <TransferManager ref="transferManagerRef" />
    
    <!-- Toast 通知 -->
    <ToastNotification ref="toastRef" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Refresh, Upload, FolderAdd, Folder, Document, Download, Delete, HomeFilled, Edit, DocumentCopy, EditPen, Box } from '@element-plus/icons-vue'
import TransferManager from './TransferManager.vue'
import ToastNotification from './ToastNotification.vue'

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
const folderUploadMode = ref('compress') // 文件夹上传方式：'compress' 或 'direct'，默认压缩上传（更快）
const transferManagerRef = ref(null) // 传输管理器引用
const toastRef = ref(null) // Toast 通知引用

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
const loadFiles = async (forceRefresh = false) => {
  if (!props.connectionId) {
    toastRef.value?.warning('请先建立 SSH 连接')
    return
  }

  loading.value = true
  
  // 如果是强制刷新，先清空文件列表确保响应式更新
  if (forceRefresh) {
    files.value = []
  }
  
  try {
    if (window.electronAPI) {
      const result = await window.electronAPI.sftp.list(
        props.connectionId,
        currentPath.value
      )
      
      if (result.success) {
        // 先清空再赋值，确保触发 Vue 的响应式更新
        const newFiles = result.files.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })
        
        // 使用 splice 或直接赋值来确保响应式
        files.value.splice(0, files.value.length, ...newFiles)
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
    toastRef.value?.error(`加载文件列表失败: ${error.message}`)
    files.value = []
  } finally {
    loading.value = false
  }
}

// 刷新文件列表
const refreshFiles = () => {
  loadFiles(true) // 点击刷新按钮时强制刷新
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
  const folders = []
  
  // 只处理顶层拖入的项目，不递归处理子目录（递归在压缩时处理）
  for (const item of items) {
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry()
      if (entry) {
        if (entry.isFile) {
          // 这是一个文件，直接添加到上传列表
          const file = await new Promise((resolve, reject) => {
            entry.file(resolve, reject)
          })
          file.fullPath = file.name // 只使用文件名，不包含父目录路径
          filesToUpload.push(file)
        } else if (entry.isDirectory) {
          // 这是一个文件夹，记录到文件夹列表（稍后询问用户如何处理）
          folders.push({
            name: entry.name,
            entry: entry,
            path: ''
          })
        }
      }
    }
  }
  
  return { filesToUpload, folders }
}

const handleDrop = async (event) => {
  const items = event.dataTransfer.items
  if (items.length > 0) {
    try {
      const { filesToUpload, folders } = await processDroppedItems(Array.from(items))
      
      // 调试信息
      console.log('拖入的文件:', filesToUpload.map(f => f.name))
      console.log('拖入的文件夹:', folders.map(f => f.name))
      
      // 如果包含文件夹，根据设置决定上传方式（不再弹窗询问）
      if (folders.length > 0) {
        const folderNames = folders.map(f => f.name).join('、')
        const modeText = folderUploadMode.value === 'compress' ? '压缩上传' : '直接上传'
        toastRef.value?.info(`检测到文件夹：${folderNames}，使用${modeText}模式`)
        
        if (folderUploadMode.value === 'compress') {
          // 压缩上传
          await uploadFoldersCompressed(folders)
        } else {
          // 直接上传文件夹：收集文件夹中的所有文件并上传
          await uploadFoldersDirect(folders, filesToUpload)
        }
      } else if (filesToUpload.length > 0) {
        // 只有文件，直接上传
        uploadFiles(filesToUpload)
      }
    } catch (error) {
      toastRef.value?.error('处理拖放文件失败: ' + error.message)
    }
  }
  isDraggingOver.value = false
}

// 直接上传文件夹（保持目录结构）
const uploadFoldersDirect = async (folders, existingFiles = []) => {
  if (!props.connectionId) {
    toastRef.value?.warning('请先建立 SSH 连接')
    return
  }

  try {
    // 收集所有文件夹中的文件
    const allFilesToUpload = [...existingFiles]
    
    for (const folder of folders) {
      const collectFiles = async (entry, basePath = '') => {
        if (entry.isFile) {
          const file = await new Promise((resolve, reject) => {
            entry.file(resolve, reject)
          })
          // 保持相对路径，包含文件夹名称
          file.fullPath = basePath + file.name
          allFilesToUpload.push(file)
        } else if (entry.isDirectory) {
          const dirReader = entry.createReader()
          const entries = await new Promise((resolve, reject) => {
            dirReader.readEntries(resolve, reject)
          })
          for (const subEntry of entries) {
            await collectFiles(subEntry, basePath + entry.name + '/')
          }
        }
      }
      
      // 从文件夹根目录开始收集
      await collectFiles(folder.entry, folder.name + '/')
    }
    
    if (allFilesToUpload.length > 0) {
      await uploadFiles(allFilesToUpload)
    } else {
      toastRef.value?.warning('没有找到可上传的文件')
    }
  } catch (error) {
    toastRef.value?.error('收集文件失败: ' + error.message)
  }
}

// 切换文件夹上传模式
const toggleFolderUploadMode = () => {
  folderUploadMode.value = folderUploadMode.value === 'compress' ? 'direct' : 'compress'
  const modeText = folderUploadMode.value === 'compress' ? '压缩上传（快速）' : '直接上传（保留结构）'
  toastRef.value?.success(`已切换到：${modeText}`)
  
  // 保存到本地存储
  try {
    localStorage.setItem('sftp_folder_upload_mode', folderUploadMode.value)
  } catch (error) {
    console.error('保存上传模式失败:', error)
  }
}

// 加载上传模式设置
const loadFolderUploadMode = () => {
  try {
    const saved = localStorage.getItem('sftp_folder_upload_mode')
    if (saved && (saved === 'compress' || saved === 'direct')) {
      folderUploadMode.value = saved
    }
  } catch (error) {
    console.error('加载上传模式失败:', error)
  }
}

// 上传文件对话框
const showUploadDialog = () => {
  toastRef.value?.info('上传功能开发中...')
}

// 新建文件夹对话框
const showNewFolderDialog = () => {
  toastRef.value?.info('新建文件夹功能开发中...')
}

// 下载文件
const downloadFile = (file) => {
  toastRef.value?.info(`下载文件: ${file.name}`)
}

// 复制路径
const copyPath = (file) => {
  const basePath = currentPath.value === '/' ? '' : currentPath.value
  const pathToCopy = file.fullPath || `${basePath}/${file.name}`
  navigator.clipboard.writeText(pathToCopy).then(() => {
    toastRef.value?.success(`已复制路径: ${pathToCopy}`)
  }).catch(() => {
    toastRef.value?.error('复制路径失败')
  })
}

// 压缩上传文件夹
const uploadFoldersCompressed = async (folders) => {
  if (!props.connectionId || !window.electronAPI) {
    toastRef.value?.warning('请先建立 SSH 连接')
    return
  }

  if (!transferManagerRef.value) {
    toastRef.value?.error('传输管理器未初始化')
    return
  }

  let successCount = 0
  let errorCount = 0

  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i]
    let taskId = null
    
    try {
      // 检查是否是 macOS 应用程序包
      if (folder.name.endsWith('.app')) {
        toastRef.value?.warning(`无法上传 "${folder.name}"，不支持 macOS 应用程序包`)
        errorCount++
        continue
      }

      // 创建传输任务
      taskId = transferManagerRef.value.addTask({
        name: folder.name,
        type: 'upload',
        totalSize: 0, // 稍后更新
        path: `${currentPath.value}/${folder.name}`
      })

      // 1. 收集文件夹中的所有文件（只收集当前文件夹内的文件，不包含父目录）
      const allFiles = []
      
      const collectFiles = async (entry, basePath = '') => {
        if (entry.isFile) {
          const file = await new Promise((resolve, reject) => {
            entry.file(resolve, reject)
          })
          
          // 跳过特殊文件
          const fileName = file.name.toLowerCase()
          if (fileName.endsWith('.asar') || 
              fileName.endsWith('.node') || 
              fileName.endsWith('.dylib') ||
              fileName.endsWith('.so') ||
              fileName.endsWith('.dll')) {
            console.log(`跳过特殊文件: ${file.name}`)
            return
          }
          
          // 相对路径只保留从当前拖动的文件夹开始的路径
          file.relativePath = basePath + file.name
          allFiles.push(file)
        } else if (entry.isDirectory) {
          // 跳过 .app 目录
          if (entry.name.endsWith('.app')) {
            console.log(`跳过应用程序包: ${entry.name}`)
            return
          }
          
          const dirReader = entry.createReader()
          const entries = await new Promise((resolve, reject) => {
            dirReader.readEntries(resolve, reject)
          })
          // 递归收集子目录的文件，保持目录结构
          for (const subEntry of entries) {
            await collectFiles(subEntry, basePath + entry.name + '/')
          }
        }
      }
      
      // 从文件夹的根目录开始收集，确保只包含该文件夹的内容
      await collectFiles(folder.entry, '')
      
      if (allFiles.length === 0) {
        transferManagerRef.value.updateTask(taskId, {
          status: 'error',
          percentage: 0
        })
        errorCount++
        continue
      }

      // 检查文件总大小，如果太大建议使用直接上传
      const totalSize = allFiles.reduce((sum, file) => sum + file.size, 0)
      
      // 更新任务的总大小
      transferManagerRef.value.updateTask(taskId, {
        totalSize: totalSize,
        percentage: 5
      })
      
      const maxSize = 500 * 1024 * 1024 // 500MB
      
      if (totalSize > maxSize) {
        transferManagerRef.value.updateTask(taskId, {
          status: 'error',
          percentage: 0
        })
        toastRef.value?.warning(`文件夹 "${folder.name}" 太大 (${(totalSize / 1024 / 1024).toFixed(1)}MB)，建议使用"直接上传"模式`)
        errorCount++
        continue
      }

      // 2. 将文件保存到临时目录（避免大文件内存溢出）
      transferManagerRef.value.updateTask(taskId, {
        percentage: 10
      })
      
      // 获取临时目录
      const tempPathResult = await window.electronAPI.settings.getTempPath()
      if (!tempPathResult.success) {
        throw new Error('获取临时目录失败')
      }
      
      const tempDir = `${tempPathResult.path}/${folder.name}_${Date.now()}`
      
      // 保存文件到临时目录（使用文件流，避免内存溢出）
      const filesData = []
      for (const file of allFiles) {
        const arrayBuffer = await file.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)
        filesData.push({
          name: file.name,
          relativePath: file.relativePath,
          data: uint8Array, // 直接使用 Uint8Array，不转换为普通数组
          size: file.size
        })
      }
      
      transferManagerRef.value.updateTask(taskId, {
        percentage: 20,
        currentSize: totalSize * 0.2
      })
      
      // 保存文件到临时目录
      const saveResult = await window.electronAPI.system.saveFilesToTemp({
        tempDir: tempDir,
        filesData: filesData
      })
      
      if (!saveResult.success) {
        throw new Error('保存临时文件失败: ' + saveResult.message)
      }
      
      // 3. 压缩文件夹
      transferManagerRef.value.updateTask(taskId, {
        percentage: 40,
        currentSize: totalSize * 0.4
      })
      
      const zipResult = await window.electronAPI.system.compressFolderPath({
        folderPath: tempDir,
        folderName: folder.name
      })
      
      if (!zipResult.success) {
        throw new Error(zipResult.message || '压缩失败')
      }
      
      transferManagerRef.value.updateTask(taskId, {
        percentage: 50,
        currentSize: totalSize * 0.5
      })

      // 3. 上传压缩文件（tar.gz 格式）
      const remoteTarPath = `${currentPath.value}/${folder.name}.tar.gz`.replace('//', '/')
      const uploadResult = await window.electronAPI.sftp.upload(
        props.connectionId,
        zipResult.zipPath, // zipPath 字段兼容 tar.gz 路径
        remoteTarPath
      )

      if (!uploadResult.success) {
        throw new Error(uploadResult.message || '上传失败')
      }

      transferManagerRef.value.updateTask(taskId, {
        percentage: 70,
        currentSize: totalSize * 0.7
      })

      // 4. 在远程服务器解压（使用 tar 命令，几乎所有 Linux 系统都自带）
      console.log(`开始解压: ${folder.name}.tar.gz 到 ${currentPath.value}`)
      
      // tar 命令是 Linux 标准命令，不需要额外安装
      // -xzf: x=解压, z=gzip压缩, f=文件
      // -C: 指定解压目录
      const extractResult = await window.electronAPI.ssh.execute(
        props.connectionId,
        `cd "${currentPath.value}" && tar -xzf "${folder.name}.tar.gz"`
      )

      console.log('解压结果:', extractResult)

      if (!extractResult.success) {
        throw new Error('解压失败: ' + extractResult.message)
      }

      transferManagerRef.value.updateTask(taskId, {
        percentage: 90,
        currentSize: totalSize * 0.9
      })

      // 5. 删除远程 tar.gz 文件
      const deleteTarResult = await window.electronAPI.ssh.execute(
        props.connectionId,
        `rm "${currentPath.value}/${folder.name}.tar.gz"`
      )

      if (!deleteTarResult.success) {
        console.warn('删除远程 tar.gz 文件失败:', deleteTarResult.message)
      }

      transferManagerRef.value.updateTask(taskId, {
        percentage: 95,
        currentSize: totalSize * 0.95
      })

      // 7. 删除本地临时目录和压缩文件
      try {
        if (window.electronAPI.system.deleteFile) {
          await window.electronAPI.system.deleteFile(zipResult.zipPath)
        }
        if (window.electronAPI.system.deleteFolder) {
          await window.electronAPI.system.deleteFolder(tempDir)
        }
      } catch (cleanError) {
        console.warn('清理临时文件失败:', cleanError)
      }

      transferManagerRef.value.updateTask(taskId, {
        percentage: 100,
        currentSize: totalSize,
        status: 'success'
      })
      
      console.log(`✓ 文件夹 "${folder.name}" 上传并解压成功`)
      successCount++

    } catch (error) {
      errorCount++
      if (taskId) {
        transferManagerRef.value.updateTask(taskId, {
          status: 'error',
          percentage: 0
        })
      }
      console.error('压缩上传失败:', error)
      
      // 根据错误类型给出更友好的提示
      let errorMsg = error.message
      if (errorMsg.includes('解压') || errorMsg.includes('tar')) {
        toastRef.value?.error(`"${folder.name}" 解压失败: ${errorMsg}`, '解压错误', 8000)
      } else if (errorMsg.includes('上传失败')) {
        toastRef.value?.error(`"${folder.name}" 上传失败: ${errorMsg}`, '上传错误', 5000)
      } else {
        toastRef.value?.error(`"${folder.name}" 失败: ${errorMsg}`, '错误', 5000)
      }
    }
  }

  // 上传完成后刷新文件列表
  if (successCount > 0) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    await loadFiles(true) // 强制刷新
    if (errorCount > 0) {
      toastRef.value?.warning(`上传并解压完成: 成功 ${successCount} 个，失败 ${errorCount} 个`, '部分成功', 5000)
    } else {
      toastRef.value?.success(`上传并解压完成: ${successCount} 个文件夹已成功上传到服务器并自动解压`, '全部成功', 4000)
    }
  }
}

// 上传文件（拖放或点击上传）
const uploadFiles = async (filesToUpload) => {
  if (!props.connectionId) {
    toastRef.value?.warning('请先选择连接')
    return
  }

  if (filesToUpload.length === 0) {
    return
  }

  if (!transferManagerRef.value) {
    toastRef.value?.error('传输管理器未初始化')
    return
  }

  let successCount = 0
  let errorCount = 0

  for (let i = 0; i < filesToUpload.length; i++) {
    const file = filesToUpload[i]
    let taskId = null
    
    try {
      // 创建传输任务
      taskId = transferManagerRef.value.addTask({
        name: file.fullPath || file.name,
        type: 'upload',
        totalSize: file.size || 0,
        path: `${currentPath.value}/${file.fullPath || file.name}`
      })

      if (window.electronAPI && window.electronAPI.sftp) {
        // 计算远程路径（保持文件夹结构）
        const remotePath = file.fullPath 
          ? `${currentPath.value}/${file.fullPath}`.replace('//', '/')
          : `${currentPath.value}/${file.name}`.replace('//', '/')

        const result = await window.electronAPI.sftp.upload(
          props.connectionId,
          file.path || file,
          remotePath
        )

        if (result.success) {
          successCount++
          transferManagerRef.value.updateTask(taskId, {
            percentage: 100,
            currentSize: file.size,
            status: 'success'
          })
        } else {
          errorCount++
          transferManagerRef.value.updateTask(taskId, {
            status: 'error',
            percentage: 0
          })
        }
      }
    } catch (error) {
      errorCount++
      if (taskId) {
        transferManagerRef.value.updateTask(taskId, {
          status: 'error',
          percentage: 0
        })
      }
      toastRef.value?.error(`上传 "${file.name}" 失败: ${error.message}`)
    }
  }

  // 上传完成后刷新文件列表
  if (successCount > 0) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    await loadFiles(true) // 强制刷新
    toastRef.value?.success(`上传完成: 成功 ${successCount} 个，失败 ${errorCount} 个`)
  }
}

// 删除文件或文件夹
const deleteFile = async (file) => {
  try {
    const itemType = file.isDirectory ? '文件夹' : '文件'
    await ElMessageBox.confirm(
      `确定要删除${itemType} "${file.name}" 吗？${file.isDirectory ? '\n\n注意：文件夹及其所有内容都将被删除！' : ''}`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        dangerouslyUseHTMLString: false
      }
    )
    
    if (!props.connectionId || !window.electronAPI) {
      toastRef.value?.error('SSH 连接不可用')
      return
    }

    const itemPath = file.fullPath || `${currentPath.value}/${file.name}`.replace('//', '/')
    
    console.log(`准备删除${itemType}: ${itemPath}`)
    
    // 根据是文件还是文件夹使用不同的删除命令
    let deleteCommand
    if (file.isDirectory) {
      // 删除文件夹及其所有内容，先检查是否存在再删除
      deleteCommand = `if [ -d "${itemPath}" ]; then rm -rf "${itemPath}" && echo "deleted"; else echo "not_found"; fi`
    } else {
      // 删除文件，先检查是否存在再删除
      deleteCommand = `if [ -f "${itemPath}" ]; then rm -f "${itemPath}" && echo "deleted"; else echo "not_found"; fi`
    }

    const result = await window.electronAPI.ssh.execute(
      props.connectionId,
      deleteCommand
    )

    console.log('删除命令结果:', result)

    if (result.success) {
      // 检查删除结果
      if (result.output && result.output.includes('not_found')) {
        toastRef.value?.warning(`${file.name} 不存在，可能已被删除`)
      } else {
        toastRef.value?.success(`已删除: ${file.name}`)
      }
      
      // 等待一小段时间确保服务器操作完成
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // 强制刷新文件列表（传入 true 参数）
      console.log('刷新文件列表...')
      await loadFiles(true)
      console.log('文件列表已刷新，当前文件数:', files.value.length)
    } else {
      throw new Error(result.message || '删除失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      // 如果不是用户取消，显示错误消息
      toastRef.value?.error(`删除失败: ${error.message || error}`)
    }
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
          toastRef.value?.info('文件名未改变')
          return
        }

        if (window.electronAPI && window.electronAPI.sftp) {
          const result = await window.electronAPI.sftp.rename(
            props.connectionId,
            `${currentPath.value}/${file.name}`,
            `${currentPath.value}/${newName}`
          )

          if (result.success) {
            toastRef.value?.success(`已重命名: ${file.name} -> ${newName}`)
            await loadFiles(true) // 强制刷新
          } else {
            throw new Error(result.message || '重命名失败')
          }
        }
      } catch (error) {
        toastRef.value?.error(`重命名失败: ${error.message}`)
      }
    }
  }).catch(() => {
    // 用户取消
  })
}

// 用编辑器打开文件
const openWithEditor = async (file) => {
  if (!props.connectionId) {
    toastRef.value?.warning('请先选择连接')
    return
  }

  if (file.isDirectory) {
    toastRef.value?.warning('不能用编辑器打开文件夹')
    return
  }

  try {
    if (window.electronAPI && window.electronAPI.sftp) {
      const remotePath = file.fullPath || `${currentPath.value}/${file.name}`.replace('//', '/')
      
      // 获取临时文件目录
      const tempPathResult = await window.electronAPI.settings.getTempPath()
      if (!tempPathResult.success) {
        toastRef.value?.error('获取临时文件目录失败')
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
        toastRef.value?.error(`下载文件失败: ${downloadResult.message}`)
        return
      }
      
      // 用编辑器打开文件
      const openResult = await window.electronAPI.openFileWithEditor(localPath)
      if (openResult.success) {
        toastRef.value?.success(`文件已用编辑器打开: ${file.name}`)
        
        // 启动文件监听，监听变化并上传
        startFileWatcher(props.connectionId, localPath, remotePath, file.name)
      } else {
        toastRef.value?.error(`打开编辑器失败: ${openResult.message}`)
      }
    } else {
      toastRef.value?.warning('当前环境不支持用编辑器打开文件')
    }
  } catch (error) {
    toastRef.value?.error(`打开文件失败: ${error.message}`)
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
                toastRef.value?.success(`文件已自动保存到服务器: ${fileName}`)
              } else {
                toastRef.value?.error(`上传文件失败: ${uploadResult?.message || '未知错误'}`)
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
  // 加载上传模式设置
  loadFolderUploadMode()
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
  background: var(--bg-primary);
  transition: background-color 0.3s ease;
}

.sftp-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: var(--bg-secondary);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  box-shadow: 0 2px 8px var(--shadow-color);
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.toolbar-left {
  flex: 1;
  min-width: 0;
}

.toolbar-left :deep(.el-breadcrumb) {
  font-size: 13px;
}

.toolbar-left :deep(.el-breadcrumb__item) {
  color: var(--text-primary);
  transition: color 0.3s ease;
}

.path-item {
  cursor: pointer;
  transition: color 0.2s ease;
}

.path-item:hover {
  color: var(--accent-color);
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

.files-container {
  flex: 1;
  overflow: hidden;
  position: relative;
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
  color: var(--text-secondary) !important;
  border-color: var(--border-color-light) !important;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 8px 12px;
  transition: color 0.3s ease, border-color 0.3s ease;
}

.files-table :deep(.el-table__body) {
  background: transparent !important;
}

.files-table :deep(.el-table__body tr) {
  background: transparent !important;
  color: var(--text-primary) !important;
  transition: all 0.2s;
}

.files-table :deep(.el-table__body tr:hover > td) {
  background: var(--hover-bg) !important;
  cursor: pointer;
}

.files-table :deep(.el-table__body td) {
  background: transparent !important;
  border-color: var(--border-color-light) !important;
  padding: 8px 12px;
  color: var(--text-primary) !important;
  transition: color 0.3s ease, border-color 0.3s ease;
}

.files-table :deep(.el-table__empty-block) {
  background: transparent !important;
}

.files-table :deep(.el-loading-mask) {
  background: var(--bg-primary) !important;
  opacity: 0.8;
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
  background: var(--bg-secondary);
  transition: background-color 0.3s ease;
}

.toolbar-left :deep(.el-breadcrumb__item) {
  font-weight: 500;
}

.toolbar-left :deep(.el-breadcrumb__separator) {
  color: var(--text-secondary);
  transition: color 0.3s ease;
}

.path-item {
  cursor: pointer;
  transition: all 0.2s;
}

.path-item:hover {
  color: var(--accent-color) !important;
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
  background: var(--card-bg);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 6px;
  min-width: 160px;
  box-shadow: 0 8px 24px var(--shadow-color);
  z-index: 9999;
  animation: fadeIn 0.15s ease-out;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  color: var(--text-primary);
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.menu-item:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
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
  background: var(--border-color);
  margin: 6px 0;
  transition: background-color 0.3s ease;
}

/* 拖放提示 */
.drag-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--accent-color);
  opacity: 0.8;
  z-index: 10;
  transition: color 0.3s ease;
}

.drag-hint p {
  margin-top: 10px;
  font-size: 14px;
}

.drag-hint-mode {
  margin-top: 8px !important;
  font-size: 12px !important;
  opacity: 0.7;
  font-weight: 500;
}

.drag-over {
  background: var(--hover-bg);
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

