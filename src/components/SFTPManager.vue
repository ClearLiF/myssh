<template>
  <div class="sftp-manager">
    <el-card class="connection-card">
      <template #header>
        <div class="card-header">
          <span>SFTP 连接配置</span>
          <el-button 
            type="primary" 
            @click="connectSFTP"
            :loading="connecting"
            :disabled="!isFormValid"
          >
            {{ isConnected ? '断开连接' : '连接' }}
          </el-button>
        </div>
      </template>
      
      <el-form :model="sftpConfig" label-width="100px" class="sftp-form">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="主机地址">
              <el-input 
                v-model="sftpConfig.host" 
                placeholder="例如: 192.168.1.100"
                :disabled="isConnected"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="端口">
              <el-input-number 
                v-model="sftpConfig.port" 
                :min="1" 
                :max="65535"
                :disabled="isConnected"
              />
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="用户名">
              <el-input 
                v-model="sftpConfig.username" 
                placeholder="SSH 用户名"
                :disabled="isConnected"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="认证方式">
              <el-select 
                v-model="sftpConfig.authType" 
                placeholder="选择认证方式"
                :disabled="isConnected"
              >
                <el-option label="密码" value="password" />
                <el-option label="私钥" value="privateKey" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-form-item 
          v-if="sftpConfig.authType === 'password'" 
          label="密码"
        >
          <el-input 
            v-model="sftpConfig.password" 
            type="password" 
            placeholder="SSH 密码"
            :disabled="isConnected"
            show-password
          />
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 文件传输区域 -->
    <el-card class="file-transfer-card" v-if="isConnected">
      <template #header>
        <div class="card-header">
          <span>文件传输 - {{ sftpConfig.host }}:{{ sftpConfig.port }}</span>
          <div class="header-actions">
            <el-button type="success" size="small" @click="uploadFile">
              <el-icon><Upload /></el-icon>
              上传文件
            </el-button>
            <el-button type="warning" size="small" @click="downloadFile">
              <el-icon><Download /></el-icon>
              下载文件
            </el-button>
            <el-button type="info" size="small" @click="downloadFolder">
              <el-icon><FolderOpened /></el-icon>
              下载文件夹
            </el-button>
          </div>
        </div>
      </template>
      
      <div class="file-transfer-container">
        <el-row :gutter="20">
          <!-- 本地文件 -->
          <el-col :span="12">
            <div class="file-panel">
              <h4>本地文件</h4>
              <el-tree
                :data="localFiles"
                :props="treeProps"
                @node-click="handleLocalFileClick"
                class="file-tree"
              />
            </div>
          </el-col>
          
          <!-- 远程文件 -->
          <el-col :span="12">
            <div class="file-panel">
              <h4>远程文件</h4>
              <el-tree
                :data="remoteFiles"
                :props="treeProps"
                @node-click="handleRemoteFileClick"
                @node-contextmenu="handleRightClick"
                :highlight-current="true"
                class="file-tree"
              />
              <div v-if="selectedRemoteItem" class="selected-item-info">
                <p><strong>已选择:</strong> {{ selectedRemoteItem.name }}</p>
                <p><strong>类型:</strong> {{ selectedRemoteItem.children ? '文件夹' : '文件' }}</p>
              </div>
            </div>
          </el-col>
        </el-row>
        
        <!-- 传输进度 -->
        <div class="transfer-progress" v-if="transferProgress.show">
          <el-progress 
            :percentage="transferProgress.percentage" 
            :status="transferProgress.status"
          />
          <p>{{ transferProgress.message }}</p>
        </div>
      </div>
    </el-card>

    <!-- 确认对话框 -->
    <el-dialog
      v-model="showConfirmDialog"
      :title="confirmDialogTitle"
      width="500px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <div class="confirm-dialog-content">
        <p>{{ confirmDialogMessage }}</p>
        <div class="download-options" v-if="confirmDialogTitle.includes('文件夹下载')">
          <h4>下载选项：</h4>
          <el-checkbox v-model="downloadOptions.overwriteExisting">覆盖已存在的文件</el-checkbox>
          <el-checkbox v-model="downloadOptions.createSubfolder">创建子文件夹</el-checkbox>
          <el-checkbox v-model="downloadOptions.preservePermissions">保留文件权限</el-checkbox>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="handleConfirmCancel">取消</el-button>
          <el-button type="primary" @click="handleConfirmOk">确认</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 右键菜单 -->
    <div 
      v-if="contextMenu.show" 
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
    >
      <div class="context-menu-item" @click="downloadSelectedItem" v-if="contextMenu.item">
        <el-icon><Download /></el-icon>
        <span>{{ contextMenu.item.children ? '下载文件夹' : '下载文件' }}</span>
      </div>
      <div class="context-menu-item" @click="copyPath" v-if="contextMenu.item">
        <el-icon><DocumentCopy /></el-icon>
        <span>复制路径</span>
      </div>
      <div class="context-menu-divider" v-if="contextMenu.item && contextMenu.item.children"></div>
      <div class="context-menu-item" @click="refreshFolder" v-if="contextMenu.item && contextMenu.item.children">
        <el-icon><Refresh /></el-icon>
        <span>刷新文件夹</span>
      </div>
    </div>

    <!-- Toast 通知组件 -->
    <ToastNotification ref="toast" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Upload, Download, FolderOpened, DocumentCopy, Refresh } from '@element-plus/icons-vue'
import ToastNotification from './ToastNotification.vue'

// SFTP 配置
const sftpConfig = ref({
  host: '',
  port: 22,
  username: '',
  authType: 'password',
  password: ''
})

// 状态管理
const connecting = ref(false)
const isConnected = ref(false)
const toast = ref(null)

// 文件树配置
const treeProps = {
  children: 'children',
  label: 'name'
}

// 本地文件
const localFiles = ref([
  {
    name: 'Documents',
    children: [
      { name: 'work', children: [] },
      { name: 'personal', children: [] }
    ]
  },
  {
    name: 'Downloads',
    children: []
  }
])

// 远程文件
const remoteFiles = ref([
  {
    name: '/home',
    path: '/home',
    children: [
      { 
        name: 'user', 
        path: '/home/user',
        children: [
          { name: 'documents', path: '/home/user/documents', children: [] },
          { name: 'downloads', path: '/home/user/downloads', children: [] },
          { name: 'config.txt', path: '/home/user/config.txt' }
        ] 
      },
      { 
        name: 'config', 
        path: '/home/config',
        children: [
          { name: 'app.conf', path: '/home/config/app.conf' },
          { name: 'database.conf', path: '/home/config/database.conf' }
        ] 
      }
    ]
  },
  {
    name: '/var',
    path: '/var',
    children: [
      { 
        name: 'log', 
        path: '/var/log',
        children: [
          { name: 'system.log', path: '/var/log/system.log' },
          { name: 'error.log', path: '/var/log/error.log' }
        ] 
      },
      { name: 'cache', path: '/var/cache', children: [] }
    ]
  }
])

// 传输进度
const transferProgress = ref({
  show: false,
  percentage: 0,
  status: '',
  message: ''
})

// 选中的文件/文件夹
const selectedRemoteItem = ref(null)
const selectedLocalItem = ref(null)

// 下载选项
const downloadOptions = ref({
  overwriteExisting: false,
  createSubfolder: true,
  preservePermissions: false
})

// 确认对话框状态
const showConfirmDialog = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmDialogResolve = ref(null)

// 右键菜单状态
const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  item: null
})

// 表单验证
const isFormValid = computed(() => {
  const { host, username, authType, password } = sftpConfig.value
  if (!host || !username) return false
  
  if (authType === 'password') {
    return !!password
  }
  
  return false
})

// 连接 SFTP
const connectSFTP = async () => {
  if (isConnected.value) {
    await disconnectSFTP()
    return
  }

  connecting.value = true
  toast.value?.info(`正在连接到 ${sftpConfig.value.host}:${sftpConfig.value.port}`, '正在连接...')

  try {
    // 模拟连接过程
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    isConnected.value = true
    toast.value?.success(`已成功连接到 ${sftpConfig.value.host}`, 'SFTP 连接成功')
  } catch (error) {
    toast.value?.error(error.message || '无法连接到远程主机', 'SFTP 连接失败')
  } finally {
    connecting.value = false
  }
}

// 断开 SFTP 连接
const disconnectSFTP = async () => {
  try {
    isConnected.value = false
    toast.value?.info('SFTP 连接已断开', '已断开连接')
  } catch (error) {
    toast.value?.error('断开连接时发生错误')
  }
}

// 处理本地文件点击
const handleLocalFileClick = (data) => {
  console.log('本地文件点击:', data)
}

// 处理远程文件点击
const handleRemoteFileClick = (data) => {
  console.log('远程文件点击:', data)
  selectedRemoteItem.value = data
}

// 确认对话框处理
const showConfirm = (title, message) => {
  return new Promise((resolve) => {
    confirmDialogTitle.value = title
    confirmDialogMessage.value = message
    confirmDialogResolve.value = resolve
    showConfirmDialog.value = true
  })
}

const handleConfirmOk = () => {
  showConfirmDialog.value = false
  if (confirmDialogResolve.value) {
    confirmDialogResolve.value(true)
    confirmDialogResolve.value = null
  }
}

const handleConfirmCancel = () => {
  showConfirmDialog.value = false
  if (confirmDialogResolve.value) {
    confirmDialogResolve.value(false)
    confirmDialogResolve.value = null
  }
}

// 右键菜单处理
const handleRightClick = (event, data) => {
  event.preventDefault()
  
  // 设置选中的项目
  selectedRemoteItem.value = data
  
  // 显示右键菜单
  contextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    item: data
  }
  
  // 点击其他地方隐藏菜单
  const hideMenu = () => {
    contextMenu.value.show = false
    document.removeEventListener('click', hideMenu)
  }
  
  setTimeout(() => {
    document.addEventListener('click', hideMenu)
  }, 0)
}

// 下载选中的项目（通过右键菜单）
const downloadSelectedItem = () => {
  contextMenu.value.show = false
  
  if (!contextMenu.value.item) return
  
  if (contextMenu.value.item.children) {
    // 是文件夹，调用文件夹下载
    downloadFolder()
  } else {
    // 是文件，调用文件下载
    downloadFile()
  }
}

// 复制路径
const copyPath = async () => {
  contextMenu.value.show = false
  
  if (!contextMenu.value.item) return
  
  try {
    const path = contextMenu.value.item.path || contextMenu.value.item.name
    await navigator.clipboard.writeText(path)
    toast.value?.success(`已复制路径: ${path}`, '复制成功')
  } catch (error) {
    toast.value?.error('复制路径失败', '复制失败')
  }
}

// 刷新文件夹
const refreshFolder = () => {
  contextMenu.value.show = false
  
  if (!contextMenu.value.item || !contextMenu.value.item.children) return
  
  toast.value?.info(`正在刷新文件夹: ${contextMenu.value.item.name}`, '刷新中')
  
  // 这里可以添加实际的刷新逻辑
  setTimeout(() => {
    toast.value?.success(`文件夹 ${contextMenu.value.item.name} 已刷新`, '刷新完成')
  }, 1000)
}

// 上传文件
const uploadFile = () => {
  toast.value?.info('文件上传功能需要集成 Electron 文件对话框', '功能提示')
}

// 下载文件
const downloadFile = async () => {
  if (!selectedRemoteItem.value) {
    toast.value?.warning('请先选择要下载的文件', '选择提示')
    return
  }

  if (selectedRemoteItem.value.children) {
    toast.value?.warning('选中的是文件夹，请使用"下载文件夹"功能', '类型错误')
    return
  }

  try {
    transferProgress.value = {
      show: true,
      percentage: 0,
      status: 'active',
      message: `正在下载文件: ${selectedRemoteItem.value.name}`
    }

    // 模拟文件下载进度
    for (let i = 0; i <= 100; i += 10) {
      transferProgress.value.percentage = i
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    transferProgress.value.status = 'success'
    transferProgress.value.message = `文件下载完成: ${selectedRemoteItem.value.name}`
    
    toast.value?.success(`文件 ${selectedRemoteItem.value.name} 下载成功`, '下载完成')
    
    // 3秒后隐藏进度条
    setTimeout(() => {
      transferProgress.value.show = false
    }, 3000)
    
  } catch (error) {
    transferProgress.value.status = 'exception'
    transferProgress.value.message = `下载失败: ${error.message}`
    toast.value?.error('文件下载失败：' + error.message, '下载错误')
  }
}

// 下载文件夹
const downloadFolder = async () => {
  if (!selectedRemoteItem.value) {
    toast.value?.warning('请先选择要下载的文件夹', '选择提示')
    return
  }

  if (!selectedRemoteItem.value.children) {
    toast.value?.warning('选中的是文件，请使用"下载文件"功能', '类型错误')
    return
  }

  try {
    // 显示下载选项对话框
    const confirmed = await showDownloadOptionsDialog()
    if (!confirmed) return

    transferProgress.value = {
      show: true,
      percentage: 0,
      status: 'active',
      message: `正在下载文件夹: ${selectedRemoteItem.value.name}`
    }

    // 递归下载文件夹
    await downloadFolderRecursive(selectedRemoteItem.value)

    transferProgress.value.status = 'success'
    transferProgress.value.message = `文件夹下载完成: ${selectedRemoteItem.value.name}`
    
    toast.value?.success(`文件夹 ${selectedRemoteItem.value.name} 下载成功`, '下载完成')
    
    // 3秒后隐藏进度条
    setTimeout(() => {
      transferProgress.value.show = false
    }, 3000)
    
  } catch (error) {
    transferProgress.value.status = 'exception'
    transferProgress.value.message = `下载失败: ${error.message}`
    toast.value?.error('文件夹下载失败：' + error.message, '下载错误')
  }
}

// 递归下载文件夹
const downloadFolderRecursive = async (folder, currentPath = '') => {
  const folderPath = currentPath ? `${currentPath}/${folder.name}` : folder.name
  
  // 创建本地文件夹
  const actualFolderPath = downloadOptions.value.createSubfolder ? folderPath : folder.name
  console.log(`创建文件夹: ${actualFolderPath}`)
  
  if (folder.children && folder.children.length > 0) {
    const totalItems = countTotalItems(folder)
    let processedItems = 0
    
    for (const item of folder.children) {
      if (item.children) {
        // 递归下载子文件夹
        await downloadFolderRecursive(item, folderPath)
      } else {
        // 下载文件
        const filePath = `${folderPath}/${item.name}`
        console.log(`下载文件: ${filePath}`)
        
        // 检查下载选项
        if (downloadOptions.value.overwriteExisting) {
          console.log(`覆盖模式: 将覆盖已存在的文件 ${filePath}`)
        }
        
        if (downloadOptions.value.preservePermissions) {
          console.log(`保留权限: ${filePath}`)
        }
        
        // 模拟文件下载
        await new Promise(resolve => setTimeout(resolve, 200))
        
        processedItems++
        const percentage = Math.round((processedItems / totalItems) * 100)
        transferProgress.value.percentage = percentage
        transferProgress.value.message = `正在下载: ${folderPath}/${item.name} (${processedItems}/${totalItems})`
      }
    }
  }
}

// 计算文件夹中的总文件数
const countTotalItems = (folder) => {
  let count = 0
  if (folder.children) {
    for (const item of folder.children) {
      if (item.children) {
        count += countTotalItems(item)
      } else {
        count++
      }
    }
  }
  return count
}

// 显示下载选项对话框
const showDownloadOptionsDialog = () => {
  const message = `即将下载文件夹: ${selectedRemoteItem.value.name}\n\n请确认下载选项并点击确认开始下载。`
  return showConfirm('文件夹下载选项', message)
}

onMounted(() => {
  sftpConfig.value.username = process.env.USER || 'root'
})
</script>

<style scoped>
.sftp-manager {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.connection-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.sftp-form {
  margin-top: 20px;
}

.file-transfer-card {
  flex: 1;
}

.file-transfer-container {
  min-height: 400px;
}

.file-panel {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 16px;
  height: 350px;
  background: var(--bg-secondary);
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.file-panel h4 {
  margin: 0 0 16px 0;
  color: var(--text-primary);
  font-size: 16px;
  transition: color 0.3s ease;
}

.file-tree {
  height: 280px;
  overflow-y: auto;
}

.transfer-progress {
  margin-top: 20px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 6px;
  transition: background-color 0.3s ease;
}

.transfer-progress p {
  margin: 8px 0 0 0;
  text-align: center;
  color: var(--text-primary);
  transition: color 0.3s ease;
}

.status-alert {
  margin-top: 16px;
}

.selected-item-info {
  margin-top: 12px;
  padding: 8px;
  background: var(--el-color-info-light-9);
  border-radius: 4px;
  border-left: 3px solid var(--el-color-info);
}

.selected-item-info p {
  margin: 4px 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.selected-item-info strong {
  color: var(--text-primary);
}

.confirm-dialog-content {
  padding: 16px 0;
}

.confirm-dialog-content p {
  margin-bottom: 16px;
  color: var(--text-primary);
  line-height: 1.6;
  white-space: pre-line;
}

.download-options {
  margin-top: 20px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.download-options h4 {
  margin: 0 0 12px 0;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
}

.download-options .el-checkbox {
  display: block;
  margin-bottom: 8px;
}

.download-options .el-checkbox:last-child {
  margin-bottom: 0;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* 右键菜单样式 */
.context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(10px);
  padding: 4px 0;
  min-width: 160px;
  user-select: none;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 14px;
  transition: all 0.2s ease;
}

.context-menu-item:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.context-menu-item .el-icon {
  font-size: 16px;
  color: var(--text-secondary);
}

.context-menu-item:hover .el-icon {
  color: var(--text-primary);
}

.context-menu-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}
</style>
