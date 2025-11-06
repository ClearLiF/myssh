<template>
  <div class="sftp-manager-tab">
    <!-- 文件管理器工具栏 -->
    <div class="sftp-toolbar">
      <div class="toolbar-left">
        <div class="path-input-wrapper">
          <el-icon class="path-icon"><HomeFilled /></el-icon>
          <el-input
            v-model="editableCurrentPath"
            class="path-input"
            placeholder="输入路径并按回车跳转"
            @keyup.enter="navigateToEditedPath"
            clearable
          >
            <template #append>
              <el-button 
                :icon="DocumentCopy" 
                @click="copyCurrentPath"
                title="复制当前路径"
              />
            </template>
          </el-input>
        </div>
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
        <el-button size="small" @click="showNewFileDialog">
          <el-icon><Document /></el-icon>
          新建文件
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

    <!-- 文件浏览器主体 -->
    <div class="file-browser">
      <!-- 左侧树状结构 -->
      <div class="file-tree-panel">
        <div class="tree-header">
          <span>目录树</span>
          <el-button 
            size="small" 
            text 
            @click="refreshTreeRoot"
            :loading="treeLoading"
          >
            <el-icon><Refresh /></el-icon>
          </el-button>
        </div>
        <div class="tree-content" @contextmenu.prevent="handleTreeContextMenu">
          <el-tree
            ref="fileTreeRef"
            :data="treeData"
            :props="treeProps"
            :load="loadTreeNode"
            lazy
            node-key="path"
            :highlight-current="true"
            :expand-on-click-node="true"
            @node-click="handleTreeNodeClick"
            class="directory-tree"
          >
            <template #default="{ node, data }">
              <div class="tree-node-content">
                <el-icon :size="16" color="#58a6ff">
                  <Folder />
                </el-icon>
                <span class="node-label">{{ node.label }}</span>
              </div>
            </template>
          </el-tree>
        </div>
      </div>

      <!-- 右侧文件列表 -->
      <div 
        class="files-container"
        @dragover.prevent="handleDragOver"
        @dragleave.prevent="handleDragLeave"
        @drop.prevent="handleDrop"
        @contextmenu.prevent="handleContainerContextMenu"
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

        <!-- 空状态 -->
        <div v-if="!loading && files.length === 0" class="empty-files">
          <el-empty description="此目录为空" />
        </div>

        <!-- 右键菜单 -->
        <div 
          v-if="contextMenuVisible" 
          class="context-menu"
          :style="{ top: contextMenuY + 'px', left: contextMenuX + 'px' }"
          @click="closeContextMenu"
        >
          <!-- 文件/文件夹右键菜单 -->
          <template v-if="selectedFile">
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
              v-if="!selectedFile.isDirectory"
              class="menu-item"
              @click="openWithEditor(selectedFile)"
            >
              <el-icon><EditPen /></el-icon>
              <span>用编辑器打开</span>
            </div>
            <div 
              v-if="!selectedFile.isDirectory" 
              class="menu-item"
              @click="downloadFile(selectedFile)"
            >
              <el-icon><Download /></el-icon>
              <span>下载文件</span>
            </div>
            <div 
              v-if="selectedFile.isDirectory" 
              class="menu-item"
              @click="downloadFolder(selectedFile)"
            >
              <el-icon><FolderOpened /></el-icon>
              <span>下载文件夹</span>
            </div>
            <div 
              class="menu-item danger"
              @click="deleteFile(selectedFile)"
            >
              <el-icon><Delete /></el-icon>
              <span>删除</span>
            </div>
            <div class="menu-divider"></div>
          </template>
          
          <!-- 通用菜单选项 -->
          <div class="menu-item" @click="showNewFileDialog">
            <el-icon><Document /></el-icon>
            <span>新建文件</span>
          </div>
          <div class="menu-item" @click="showNewFolderDialog">
            <el-icon><FolderAdd /></el-icon>
            <span>新建文件夹</span>
          </div>
          <div class="menu-item" @click="showUploadDialog">
            <el-icon><Upload /></el-icon>
            <span>上传文件</span>
          </div>
          <div class="menu-divider"></div>
          <div class="menu-item" @click="refreshFiles">
            <el-icon><Refresh /></el-icon>
            <span>刷新</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 传输管理器 -->
    <TransferManager ref="transferManagerRef" />
    
    <!-- Toast 通知 -->
    <ToastNotification ref="toastRef" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted, nextTick } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Refresh, Upload, FolderAdd, Folder, Document, Download, Delete, HomeFilled, Edit, DocumentCopy, EditPen, Box, FolderOpened } from '@element-plus/icons-vue'
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
const editableCurrentPath = ref('/') // 可编辑的当前路径
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

// 树相关
const treeData = ref([])
const treeLoading = ref(false)
const fileTreeRef = ref(null)
const treeProps = {
  label: 'name',
  children: 'children',
  isLeaf: 'isLeaf'
}

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

// 判断是否为文本文件
const isTextFile = (filename) => {
  const textExtensions = [
    '.txt', '.log', '.md', '.json', '.xml', '.html', '.htm', '.css', '.js', '.jsx',
    '.ts', '.tsx', '.vue', '.java', '.c', '.cpp', '.h', '.py', '.rb', '.php',
    '.sh', '.bash', '.zsh', '.yml', '.yaml', '.toml', '.ini', '.conf', '.config',
    '.sql', '.go', '.rs', '.swift', '.kt', '.gradle', '.properties', '.env',
    '.gitignore', '.dockerignore', '.editorconfig', '.eslintrc', '.prettierrc',
    'Dockerfile', 'Makefile', 'README', 'LICENSE', 'CHANGELOG'
  ]
  
  const lowerName = filename.toLowerCase()
  
  // 检查扩展名
  if (textExtensions.some(ext => lowerName.endsWith(ext))) {
    return true
  }
  
  // 检查无扩展名的文本文件
  if (!lowerName.includes('.') && textExtensions.some(name => lowerName === name.toLowerCase())) {
    return true
  }
  
  return false
}

// 双击行
const handleRowDoubleClick = (row) => {
  if (row.isDirectory) {
    // 双击文件夹：进入文件夹
    currentPath.value = currentPath.value === '/' 
      ? `/${row.name}`
      : `${currentPath.value}/${row.name}`
    loadFiles()
    
    // 在树中设置当前节点并高亮
    setCurrentNodeInTree(currentPath.value)
  } else {
    // 双击文件：如果是文本文件则用编辑器打开
    if (isTextFile(row.name)) {
      openWithEditor(row)
    } else {
      // 非文本文件，提示下载
      toastRef.value?.info(`"${row.name}" 不是文本文件，请使用右键菜单下载`)
    }
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

// 处理容器右键菜单（空白区域）
const handleContainerContextMenu = (event) => {
  // 检查是否点击在表格行上
  const target = event.target
  const isTableRow = target.closest('.el-table__row')
  
  // 如果点击在表格行上，不显示容器菜单（由 handleRowContextMenu 处理）
  if (isTableRow) {
    return
  }
  
  event.preventDefault()
  selectedFile.value = null  // 空白区域右键，清空选中文件
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  contextMenuVisible.value = true
}

// 处理树右键菜单
const handleTreeContextMenu = (event) => {
  event.preventDefault()
  selectedFile.value = null  // 树区域右键，清空选中文件
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

// 复制当前路径
const copyCurrentPath = () => {
  navigator.clipboard.writeText(currentPath.value).then(() => {
    toastRef.value?.success(`已复制路径: ${currentPath.value}`)
  }).catch(() => {
    toastRef.value?.error('复制路径失败')
  })
}

// 导航到编辑的路径
const navigateToEditedPath = async () => {
  let path = editableCurrentPath.value.trim()
  if (!path) {
    path = '/'
  }
  // 确保路径以 / 开头
  if (!path.startsWith('/')) {
    path = '/' + path
  }
  // 移除末尾的 /
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1)
  }
  currentPath.value = path
  await loadFiles()
  
  // 在树中设置当前节点并高亮
  setCurrentNodeInTree(path)
}

// 在树中设置当前节点
const setCurrentNodeInTree = (path) => {
  if (fileTreeRef.value && path !== '/') {
    // 使用 nextTick 确保树已经渲染
    nextTick(() => {
      try {
        fileTreeRef.value.setCurrentKey(path)
      } catch (error) {
        console.log('设置当前节点失败:', error)
      }
    })
  }
}

// 刷新树根节点
const refreshTreeRoot = async () => {
  treeLoading.value = true
  try {
    await loadTreeRoot()
  } finally {
    treeLoading.value = false
  }
}

// 加载树根节点
const loadTreeRoot = async () => {
  if (!props.connectionId) {
    return
  }

  try {
    if (window.electronAPI) {
      const result = await window.electronAPI.sftp.list(props.connectionId, '/')
      if (result.success) {
        const folders = result.files
          .filter(file => file.isDirectory)
          .map(file => ({
            name: file.name,
            path: `/${file.name}`,
            isLeaf: false
          }))
        treeData.value = folders
      }
    } else {
      // 模拟数据
      treeData.value = [
        { name: 'home', path: '/home', isLeaf: false },
        { name: 'var', path: '/var', isLeaf: false },
        { name: 'etc', path: '/etc', isLeaf: false },
        { name: 'opt', path: '/opt', isLeaf: false }
      ]
    }
  } catch (error) {
    console.error('加载目录树失败:', error)
  }
}

// 懒加载树节点
const loadTreeNode = async (node, resolve) => {
  if (!props.connectionId) {
    resolve([])
    return
  }

  const nodePath = node.data ? node.data.path : '/'
  
  try {
    if (window.electronAPI) {
      const result = await window.electronAPI.sftp.list(props.connectionId, nodePath)
      if (result.success) {
        const folders = result.files
          .filter(file => file.isDirectory)
          .map(file => ({
            name: file.name,
            path: `${nodePath}/${file.name}`.replace('//', '/'),
            isLeaf: false
          }))
        resolve(folders)
      } else {
        resolve([])
      }
    } else {
      // 模拟数据
      await new Promise(r => setTimeout(r, 300))
      resolve([
        { name: 'subfolder1', path: `${nodePath}/subfolder1`, isLeaf: false },
        { name: 'subfolder2', path: `${nodePath}/subfolder2`, isLeaf: false }
      ])
    }
  } catch (error) {
    console.error('加载树节点失败:', error)
    resolve([])
  }
}

// 处理树节点点击
const handleTreeNodeClick = (data, node) => {
  currentPath.value = data.path
  loadFiles()
  
  // 设置当前节点高亮
  nextTick(() => {
    if (fileTreeRef.value) {
      fileTreeRef.value.setCurrentKey(data.path)
    }
  })
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
  
  console.log(`🔍 开始处理拖入的 ${items.length} 个项目`)
  console.log('DataTransfer items:', items)
  
  // 使用 Promise.all 并行处理所有项目，避免顺序处理可能的问题
  const processPromises = []
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    console.log(`📋 处理项目 ${i + 1}/${items.length}:`, {
      kind: item.kind,
      type: item.type
    })
    
    if (item.kind === 'file') {
      const processPromise = (async () => {
        try {
          const entry = item.webkitGetAsEntry()
          if (!entry) {
            console.warn(`⚠️ 无法获取项目 ${i + 1} 的 entry`)
            return
          }
          
          console.log(`📁 项目名称: ${entry.name}, 类型: ${entry.isFile ? '文件' : '文件夹'}`)
          
          if (entry.isFile) {
            // 这是一个文件，直接添加到上传列表
            try {
              const file = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                  reject(new Error('获取文件超时'))
                }, 5000)
                
                entry.file((f) => {
                  clearTimeout(timeout)
                  resolve(f)
                }, (error) => {
                  clearTimeout(timeout)
                  reject(error)
                })
              })
              
              file.fullPath = file.name // 只使用文件名，不包含父目录路径
              filesToUpload.push(file)
              console.log(`✅ 添加文件: ${file.name} (${file.size} bytes)`)
            } catch (error) {
              console.error(`❌ 处理文件失败: ${entry.name}`, error)
            }
          } else if (entry.isDirectory) {
            // 这是一个文件夹，记录到文件夹列表
            folders.push({
              name: entry.name,
              entry: entry,
              path: ''
            })
            console.log(`✅ 添加文件夹: ${entry.name}`)
          }
        } catch (error) {
          console.error(`❌ 处理项目 ${i + 1} 失败:`, error)
        }
      })()
      
      processPromises.push(processPromise)
    } else {
      console.warn(`⚠️ 跳过非文件项目 ${i + 1}: ${item.kind}`)
    }
  }
  
  // 等待所有项目处理完成
  await Promise.all(processPromises)
  
  console.log(`🎉 处理完成 - 文件: ${filesToUpload.length} 个, 文件夹: ${folders.length} 个`)
  console.log('📄 文件列表:', filesToUpload.map(f => f.name))
  console.log('📁 文件夹列表:', folders.map(f => f.name))
  
  return { filesToUpload, folders }
}

const handleDrop = async (event) => {
  const items = event.dataTransfer.items
  console.log(`🚀 拖放事件触发，共 ${items.length} 个项目`)
  console.log('Event details:', {
    itemsLength: items.length,
    types: Array.from(items).map(item => ({ kind: item.kind, type: item.type }))
  })
  
  if (items.length > 0) {
    try {
      console.log('🔄 开始处理拖放项目...')
      const { filesToUpload, folders } = await processDroppedItems(Array.from(items))
      
      // 详细调试信息
      console.log('📊 处理结果统计:')
      console.log('  - 文件数量:', filesToUpload.length)
      console.log('  - 文件夹数量:', folders.length)
      console.log('  - 文件列表:', filesToUpload.map(f => f.name))
      console.log('  - 文件夹列表:', folders.map(f => f.name))
      
      // 处理混合情况：既有文件又有文件夹
      if (folders.length > 0 && filesToUpload.length > 0) {
        const folderNames = folders.map(f => f.name).join('、')
        const fileNames = filesToUpload.map(f => f.name).join('、')
        const modeText = folderUploadMode.value === 'compress' ? '压缩上传' : '直接上传'
        
        console.log(`🎯 混合模式: ${folders.length} 个文件夹 + ${filesToUpload.length} 个文件`)
        toastRef.value?.info(`检测到 ${folders.length} 个文件夹（${folderNames}）和 ${filesToUpload.length} 个文件（${fileNames}），使用${modeText}模式`)
        
        if (folderUploadMode.value === 'compress') {
          // 压缩上传文件夹，然后单独上传文件
          console.log('📦 开始压缩上传文件夹...')
          await uploadFoldersCompressed(folders)
          
          console.log('📄 开始上传单独文件...')
          if (filesToUpload.length > 0) {
            await uploadFiles(filesToUpload)
          }
          console.log('✅ 混合上传完成')
        } else {
          // 直接上传文件夹：收集文件夹中的所有文件并与单独文件一起上传
          console.log('📁 开始直接上传模式...')
          await uploadFoldersDirect(folders, filesToUpload)
          console.log('✅ 直接上传完成')
        }
      } else if (folders.length > 0) {
        // 只有文件夹
        const folderNames = folders.map(f => f.name).join('、')
        const modeText = folderUploadMode.value === 'compress' ? '压缩上传' : '直接上传'
        
        console.log(`📁 纯文件夹模式: ${folders.length} 个文件夹`)
        toastRef.value?.info(`检测到 ${folders.length} 个文件夹：${folderNames}，使用${modeText}模式`)
        
        if (folderUploadMode.value === 'compress') {
          // 压缩上传
          console.log('📦 开始压缩上传文件夹...')
          await uploadFoldersCompressed(folders)
        } else {
          // 直接上传文件夹：收集文件夹中的所有文件并上传
          console.log('📁 开始直接上传文件夹...')
          await uploadFoldersDirect(folders, filesToUpload)
        }
        console.log('✅ 文件夹上传完成')
      } else if (filesToUpload.length > 0) {
        // 只有文件，直接上传
        const fileNames = filesToUpload.map(f => f.name).join('、')
        
        console.log(`📄 纯文件模式: ${filesToUpload.length} 个文件`)
        toastRef.value?.info(`检测到 ${filesToUpload.length} 个文件：${fileNames}，开始上传`)
        await uploadFiles(filesToUpload)
        console.log('✅ 文件上传完成')
      } else {
        console.warn('⚠️ 没有检测到可上传的文件或文件夹')
        toastRef.value?.warning('没有检测到可上传的文件或文件夹')
      }
    } catch (error) {
      console.error('❌ 处理拖放文件失败:', error)
      toastRef.value?.error('处理拖放文件失败: ' + error.message)
    }
  } else {
    console.warn('⚠️ 没有拖放项目')
  }
  
  console.log('🏁 拖放处理结束')
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
const showUploadDialog = async () => {
  if (!props.connectionId) {
    toastRef.value?.error('请先建立 SSH 连接')
    return
  }

  if (!window.electronAPI || !window.electronAPI.selectFiles) {
    toastRef.value?.error('当前环境不支持选择文件')
    return
  }

  try {
    // 调用 Electron 文件选择对话框
    const result = await window.electronAPI.selectFiles({
      title: '选择要上传的文件',
      buttonLabel: '上传',
      properties: ['openFile', 'multiSelections']
    })

    if (result && result.filePaths && result.filePaths.length > 0) {
      // 将选择的文件转换为上传格式
      const filesToUpload = result.filePaths.map(filePath => ({
        path: filePath,
        name: filePath.split(/[/\\]/).pop(), // 提取文件名
        fullPath: filePath.split(/[/\\]/).pop()
      }))
      
      // 调用上传函数
      await uploadFiles(filesToUpload)
    }
  } catch (error) {
    console.error('选择文件失败:', error)
    toastRef.value?.error('选择文件失败: ' + error.message)
  }
}

// 新建文件夹对话框
const showNewFolderDialog = () => {
  ElMessageBox.prompt('请输入新文件夹名称', '新建文件夹', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputPlaceholder: '例如: my_folder',
    inputValidator: (value) => {
      if (!value || !value.trim()) {
        return '文件夹名称不能为空'
      }
      const trimmedValue = value.trim()
      if (trimmedValue.includes('/') || trimmedValue.includes('\\')) {
        return '文件夹名称不能包含路径分隔符 / 或 \\'
      }
      // 检查是否与现有文件夹重名
      const exists = files.value.some(file => file.name === trimmedValue)
      if (exists) {
        return '该文件夹名称已存在'
      }
      return true
    }
  }).then(async ({ value }) => {
    if (value && value.trim()) {
      await createFolder(value.trim())
    }
  }).catch(() => {
    // 用户取消
  })
}

// 创建文件夹
const createFolder = async (folderName) => {
  if (!props.connectionId) {
    toastRef.value?.error('请先建立 SSH 连接')
    return
  }

  try {
    const folderPath = `${currentPath.value}/${folderName}`.replace('//', '/')
    
    if (window.electronAPI && window.electronAPI.ssh) {
      // 使用 SSH 命令创建文件夹
      const createCommand = `mkdir -p "${folderPath}"`
      const result = await window.electronAPI.ssh.execute(
        props.connectionId,
        createCommand
      )

      if (result.success) {
        toastRef.value?.success(`已创建文件夹: ${folderName}`)
        
        // 等待一小段时间确保服务器操作完成
        await new Promise(resolve => setTimeout(resolve, 300))
        
        // 刷新文件列表
        await loadFiles(true)
      } else {
        throw new Error(result.message || '创建文件夹失败')
      }
    } else {
      toastRef.value?.error('当前环境不支持创建文件夹')
    }
  } catch (error) {
    toastRef.value?.error(`创建文件夹失败: ${error.message}`)
  }
}

// 新建文件对话框
const showNewFileDialog = () => {
  ElMessageBox.prompt('请输入新文件名称', '新建文件', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputPlaceholder: '例如: config.txt',
    inputValidator: (value) => {
      if (!value || !value.trim()) {
        return '文件名称不能为空'
      }
      const trimmedValue = value.trim()
      if (trimmedValue.includes('/') || trimmedValue.includes('\\')) {
        return '文件名称不能包含路径分隔符 / 或 \\'
      }
      // 检查是否与现有文件重名
      const exists = files.value.some(file => file.name === trimmedValue)
      if (exists) {
        return '该文件名称已存在'
      }
      return true
    }
  }).then(async ({ value }) => {
    if (value && value.trim()) {
      await createFile(value.trim())
    }
  }).catch(() => {
    // 用户取消
  })
}

// 创建文件
const createFile = async (fileName) => {
  if (!props.connectionId) {
    toastRef.value?.error('请先建立 SSH 连接')
    return
  }

  try {
    const filePath = `${currentPath.value}/${fileName}`.replace('//', '/')
    
    if (window.electronAPI && window.electronAPI.ssh) {
      // 使用 SSH 命令创建空文件
      const createCommand = `touch "${filePath}"`
      const result = await window.electronAPI.ssh.execute(
        props.connectionId,
        createCommand
      )

      if (result.success) {
        toastRef.value?.success(`已创建文件: ${fileName}`)
        
        // 等待一小段时间确保服务器操作完成
        await new Promise(resolve => setTimeout(resolve, 300))
        
        // 刷新文件列表
        await loadFiles(true)
        
        // 询问是否用编辑器打开
        ElMessageBox.confirm(
          `文件创建成功，是否用编辑器打开 "${fileName}"？`,
          '提示',
          {
            confirmButtonText: '打开',
            cancelButtonText: '不打开',
            type: 'info'
          }
        ).then(() => {
          // 用户选择打开，调用编辑器打开功能
          const fileObj = {
            name: fileName,
            fullPath: filePath,
            isDirectory: false
          }
          openWithEditor(fileObj)
        }).catch(() => {
          // 用户选择不打开
        })
      } else {
        throw new Error(result.message || '创建文件失败')
      }
    } else {
      toastRef.value?.error('当前环境不支持创建文件')
    }
  } catch (error) {
    toastRef.value?.error(`创建文件失败: ${error.message}`)
  }
}

// 下载文件
const downloadFile = async (file) => {
  if (!props.connectionId) {
    toastRef.value?.error('请先建立 SSH 连接')
    return
  }

  if (file.isDirectory) {
    toastRef.value?.warning('暂不支持下载文件夹，请下载压缩包')
    return
  }

  try {
    // 先选择保存位置
    let savePath
    
    if (window.electronAPI && window.electronAPI.dialog) {
      const result = await window.electronAPI.dialog.saveFile({
        title: '保存文件',
        defaultPath: file.name,
        buttonLabel: '保存'
      })
      
      if (!result || result.canceled || !result.filePath) {
        toastRef.value?.info('已取消下载')
        return
      }
      
      savePath = result.filePath
    } else {
      toastRef.value?.error('当前环境不支持文件下载')
      return
    }

    const remotePath = file.fullPath || `${currentPath.value}/${file.name}`.replace('//', '/')
    
    // 创建传输任务（包含本地路径，用于历史记录）
    const taskId = transferManagerRef.value?.addTask({
      name: file.name,
      type: 'download',
      totalSize: file.size || 0,
      path: remotePath,
      localPath: savePath  // 添加本地保存路径
    })

    // 开始下载
    if (window.electronAPI && window.electronAPI.sftp) {
      const result = await window.electronAPI.sftp.download(
        props.connectionId,
        remotePath,
        savePath
      )

      if (result.success) {
        // 更新任务状态为完成
        if (taskId && transferManagerRef.value) {
          transferManagerRef.value.updateTask(taskId, {
            percentage: 100,
            currentSize: file.size || 0,
            status: 'success'
          })
        }
        
        toastRef.value?.success(`文件下载成功: ${file.name}`)
        
        // 询问是否打开文件所在文件夹
        if (window.electronAPI && window.electronAPI.system) {
          ElMessageBox.confirm(
            '文件已下载完成，是否打开文件所在位置？',
            '下载完成',
            {
              confirmButtonText: '打开',
              cancelButtonText: '关闭',
              type: 'success'
            }
          ).then(() => {
            window.electronAPI.system.showItemInFolder(savePath)
          }).catch(() => {
            // 用户选择不打开
          })
        }
      } else {
        // 更新任务状态为失败
        if (taskId && transferManagerRef.value) {
          transferManagerRef.value.updateTask(taskId, {
            status: 'error',
            percentage: 0
          })
        }
        throw new Error(result.message || '下载失败')
      }
    } else {
      if (taskId && transferManagerRef.value) {
        transferManagerRef.value.updateTask(taskId, {
          status: 'error',
          percentage: 0
        })
      }
      toastRef.value?.error('当前环境不支持文件下载')
    }
  } catch (error) {
    toastRef.value?.error(`下载文件失败: ${error.message}`)
  }
}

// 下载文件夹
const downloadFolder = async (folder) => {
  if (!props.connectionId) {
    toastRef.value?.error('请先建立 SSH 连接')
    return
  }

  if (!folder.isDirectory) {
    toastRef.value?.warning('选中的不是文件夹')
    return
  }

  try {
    // 显示确认对话框
    await ElMessageBox.confirm(
      `确定要下载文件夹 "${folder.name}" 吗？这将递归下载整个文件夹及其所有内容。`,
      '确认下载文件夹',
      {
        confirmButtonText: '开始下载',
        cancelButtonText: '取消',
        type: 'info'
      }
    )

    // 选择保存位置
    let savePath
    
    if (window.electronAPI && window.electronAPI.settings) {
      const result = await window.electronAPI.settings.selectDownloadPath()
      
      if (!result || !result.success || !result.directoryPath) {
        toastRef.value?.info('已取消下载')
        return
      }
      
      savePath = result.directoryPath
    } else {
      toastRef.value?.error('当前环境不支持文件夹下载')
      return
    }

    // 开始下载文件夹
    const folderPath = currentPath.value === '/' ? `/${folder.name}` : `${currentPath.value}/${folder.name}`
    
    toastRef.value?.info(`开始下载文件夹: ${folder.name}`, '下载开始')
    
    // 创建传输任务
    let taskId
    if (transferManagerRef.value) {
      taskId = transferManagerRef.value.addTask({
        type: 'download',
        name: `📁 ${folder.name}`,
        size: '计算中...',
        status: 'active',
        percentage: 0,
        speed: '0 B/s'
      })
    }

    // 递归下载文件夹
    if (window.electronAPI && window.electronAPI.sftp) {
      console.log(`开始下载文件夹: ${folder.name}`)
      console.log(`远程路径: ${folderPath}`)
      console.log(`本地路径: ${savePath}`)
      
      await downloadFolderRecursively(folderPath, savePath, folder.name, taskId)
    } else {
      if (taskId && transferManagerRef.value) {
        transferManagerRef.value.updateTask(taskId, {
          status: 'error',
          percentage: 0
        })
      }
      toastRef.value?.error('当前环境不支持文件夹下载')
    }
  } catch (error) {
    if (error.message !== 'cancel') {
      toastRef.value?.error(`下载文件夹失败: ${error.message}`)
    }
  }
}

// 递归下载文件夹的辅助函数
const downloadFolderRecursively = async (remotePath, localPath, folderName, taskId, depth = 0) => {
  try {
    const indent = '  '.repeat(depth)
    console.log(`${indent}开始下载文件夹: ${remotePath}`)
    
    // 更新进度显示
    if (taskId && transferManagerRef.value) {
      transferManagerRef.value.updateTask(taskId, {
        status: 'active',
        speed: `正在扫描: ${folderName}`
      })
    }
    
    // 创建本地文件夹
    const localFolderPath = `${localPath}/${folderName}`
    console.log(`${indent}本地路径: ${localFolderPath}`)
    
    // 获取远程文件夹内容
    console.log(`${indent}正在获取文件夹内容...`)
    const listResult = await Promise.race([
      window.electronAPI.sftp.list(props.connectionId, remotePath),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('获取文件列表超时')), 30000)
      )
    ])
    
    if (!listResult.success) {
      throw new Error(`无法读取文件夹内容: ${listResult.message}`)
    }
    
    const files = listResult.files || []
    console.log(`${indent}找到 ${files.length} 个项目`)
    
    let processedCount = 0
    let downloadedFiles = 0
    let downloadedFolders = 0
    const totalCount = files.length
    
    // 遍历文件夹中的每个项目
    for (const file of files) {
      const remoteFilePath = remotePath === '/' ? `/${file.name}` : `${remotePath}/${file.name}`
      const localFilePath = `${localFolderPath}/${file.name}`
      
      console.log(`${indent}处理项目 ${processedCount + 1}/${totalCount}: ${file.name} (${file.isDirectory ? '文件夹' : '文件'})`)
      
      if (file.isDirectory) {
        // 递归下载子文件夹
        console.log(`${indent}进入子文件夹: ${file.name}`)
        try {
          await downloadFolderRecursively(remoteFilePath, localFolderPath, file.name, taskId, depth + 1)
          downloadedFolders++
          console.log(`${indent}完成子文件夹: ${file.name}`)
        } catch (error) {
          console.error(`${indent}下载子文件夹失败: ${file.name}`, error.message)
          toastRef.value?.warning(`跳过文件夹 ${file.name}: ${error.message}`)
        }
      } else {
        // 下载文件
        console.log(`${indent}下载文件: ${file.name} (${file.size || '未知大小'})`)
        
        try {
          const downloadResult = await Promise.race([
            window.electronAPI.sftp.download(
              props.connectionId,
              remoteFilePath,
              localFilePath
            ),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('文件下载超时')), 60000)
            )
          ])
          
          if (downloadResult.success) {
            downloadedFiles++
            console.log(`${indent}✓ 文件下载成功: ${file.name}`)
          } else {
            console.error(`${indent}✗ 下载文件失败: ${file.name}`, downloadResult.message)
            toastRef.value?.warning(`跳过文件 ${file.name}: ${downloadResult.message}`)
          }
        } catch (error) {
          console.error(`${indent}✗ 下载文件异常: ${file.name}`, error.message)
          toastRef.value?.warning(`跳过文件 ${file.name}: ${error.message}`)
        }
      }
      
      processedCount++
      
      // 更新进度
      if (taskId && transferManagerRef.value) {
        const percentage = Math.round((processedCount / totalCount) * 100)
        transferManagerRef.value.updateTask(taskId, {
          status: 'active',
          percentage: percentage,
          speed: `${processedCount}/${totalCount} 项 (文件:${downloadedFiles} 文件夹:${downloadedFolders})`
        })
      }
    }
    
    console.log(`${indent}完成文件夹: ${folderName} (处理了 ${processedCount} 个项目)`)
    
    // 如果这是顶级调用，标记为完成
    if (depth === 0) {
      console.log(`顶级文件夹下载完成: ${folderName}`)
      if (taskId && transferManagerRef.value) {
        transferManagerRef.value.updateTask(taskId, {
          status: 'completed',
          percentage: 100,
          speed: `完成 - 文件:${downloadedFiles} 文件夹:${downloadedFolders}`
        })
      }
      toastRef.value?.success(`文件夹下载成功: ${folderName} (${downloadedFiles} 个文件, ${downloadedFolders} 个文件夹)`, '下载完成')
    }
    
  } catch (error) {
    console.error(`${indent}文件夹下载失败: ${folderName}`, error.message)
    
    if (depth === 0 && taskId && transferManagerRef.value) {
      transferManagerRef.value.updateTask(taskId, {
        status: 'error',
        percentage: 0,
        speed: `失败: ${error.message}`
      })
    }
    throw error
  }
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
const startFileWatcher = async (connectionId, localPath, remotePath, fileName) => {
  // 使用更高效的文件监听方式
  if (window.electronAPI && window.electronAPI.startFileWatch) {
    try {
      // 启动文件监听（Electron 主进程会使用 fs.watch）
      const watchResult = await window.electronAPI.startFileWatch({
        filePath: localPath
      })
      
      if (watchResult && watchResult.success) {
        console.log(`已启动文件监听: ${fileName}`)
        toastRef.value?.info(`✓ 文件监听已启动，保存后将自动上传到服务器`)
        
        // 监听文件变化事件
        if (window.electronAPI && window.electronAPI.onFileChange) {
          window.electronAPI.onFileChange(async (data) => {
            // 只处理当前文件的变化
            if (data.filePath === localPath) {
              console.log(`检测到文件变化: ${fileName}`)
              
              // 等待一小段时间确保文件写入完成
              await new Promise(resolve => setTimeout(resolve, 300))
              
              try {
                if (window.electronAPI && window.electronAPI.sftp) {
                  const uploadResult = await window.electronAPI.sftp.upload(
                    connectionId,
                    localPath,
                    remotePath
                  )
                  
                  if (uploadResult && uploadResult.success) {
                    toastRef.value?.success(`✓ 已自动保存到服务器: ${fileName}`)
                    console.log(`文件已上传: ${fileName}`)
                  } else {
                    toastRef.value?.error(`上传失败: ${uploadResult?.message || '未知错误'}`)
                  }
                }
              } catch (error) {
                console.error('上传文件失败:', error)
                toastRef.value?.error(`上传失败: ${error.message}`)
              }
            }
          })
        }
      }
    } catch (error) {
      console.error('启动文件监听失败:', error)
      // 降级到轮询方式
      startFileWatcherPolling(connectionId, localPath, remotePath, fileName)
    }
  } else {
    // 如果不支持文件监听API，使用轮询方式
    startFileWatcherPolling(connectionId, localPath, remotePath, fileName)
  }
}

// 轮询方式监听文件（降级方案）
const startFileWatcherPolling = (connectionId, localPath, remotePath, fileName) => {
  let lastModified = Date.now()
  let uploadInProgress = false
  const checkInterval = 1000 // 每秒检查一次
  const maxWatchTime = 30 * 60 * 1000 // 30分钟后停止监听
  let watchCount = 0
  
  console.log(`使用轮询方式监听文件: ${fileName}`)
  
  const watchTimer = setInterval(async () => {
    watchCount += checkInterval
    
    // 超过最大监听时间则停止
    if (watchCount > maxWatchTime) {
      clearInterval(watchTimer)
      console.log(`文件监听已停止: ${fileName}`)
      return
    }
    
    // 如果正在上传，跳过此次检查
    if (uploadInProgress) {
      return
    }
    
    try {
      // 检查文件修改时间
      if (window.electronAPI && window.electronAPI.getFileStats) {
        const stats = await window.electronAPI.getFileStats(localPath)
        
        if (stats && stats.mtimeMs > lastModified) {
          lastModified = stats.mtimeMs
          uploadInProgress = true
          
          console.log(`检测到文件变化: ${fileName}`)
          
          // 等待一小段时间确保文件写入完成
          await new Promise(resolve => setTimeout(resolve, 500))
          
          // 上传文件
          if (window.electronAPI && window.electronAPI.sftp) {
            const uploadResult = await window.electronAPI.sftp.upload(
              connectionId,
              localPath,
              remotePath
            )
            
            if (uploadResult && uploadResult.success) {
              toastRef.value?.success(`✓ 已自动保存到服务器: ${fileName}`)
              console.log(`文件已上传: ${fileName}`)
            } else {
              toastRef.value?.error(`上传失败: ${uploadResult?.message || '未知错误'}`)
            }
          }
          
          uploadInProgress = false
        }
      }
    } catch (error) {
      console.error('监听文件失败:', error)
      uploadInProgress = false
    }
  }, checkInterval)
}

// 监听连接ID变化
watch(() => props.connectionId, (newId) => {
  if (newId) {
    loadFiles()
    loadTreeRoot()
  }
}, { immediate: true })

// 同步 currentPath 和 editableCurrentPath，并设置树高亮
watch(currentPath, (newPath) => {
  editableCurrentPath.value = newPath
  // 设置树中的高亮节点
  setCurrentNodeInTree(newPath)
})

onMounted(() => {
  if (props.connectionId) {
    loadFiles()
    loadTreeRoot()
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
  margin-right: 16px;
}

.path-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.path-icon {
  font-size: 18px;
  color: var(--accent-color);
  flex-shrink: 0;
}

.path-input {
  flex: 1;
}

.path-input :deep(.el-input__wrapper) {
  background: var(--bg-primary);
  border-radius: 6px;
  transition: all 0.3s ease;
}

.path-input :deep(.el-input__wrapper:hover) {
  background: var(--hover-bg);
}

.path-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px var(--accent-color-alpha);
}

.toolbar-right {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* 文件浏览器主体 */
.file-browser {
  display: flex;
  flex: 1;
  overflow: hidden;
  gap: 1px;
  background: var(--border-color);
}

/* 左侧树面板 */
.file-tree-panel {
  width: 280px;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.tree-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
  transition: all 0.3s ease;
}

.tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.directory-tree {
  background: transparent;
}

.directory-tree :deep(.el-tree-node__content) {
  padding: 6px 8px;
  border-radius: 4px;
  margin: 2px 0;
  transition: all 0.2s;
  height: 32px;
}

.directory-tree :deep(.el-tree-node__content:hover) {
  background: var(--hover-bg);
}

.directory-tree :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: var(--accent-color-alpha);
  color: var(--accent-color);
  font-weight: 600;
}

.directory-tree :deep(.el-tree-node__expand-icon) {
  color: var(--text-secondary);
  transition: all 0.2s;
}

.directory-tree :deep(.el-tree-node__expand-icon.is-leaf) {
  color: transparent;
}

.directory-tree :deep(.el-tree-node__expand-icon.expanded) {
  transform: rotate(90deg);
}

.tree-node-content {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.node-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.files-container {
  flex: 1;
  overflow: hidden;
  position: relative;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
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
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  text-align: center;
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

