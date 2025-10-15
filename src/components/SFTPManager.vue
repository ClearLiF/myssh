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
                class="file-tree"
              />
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

    <!-- 连接状态提示 -->
    <el-alert
      v-if="connectionStatus"
      :title="connectionStatus.title"
      :type="connectionStatus.type"
      :description="connectionStatus.description"
      show-icon
      :closable="false"
      class="status-alert"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload, Download } from '@element-plus/icons-vue'

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
const connectionStatus = ref(null)

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
    children: [
      { name: 'user', children: [] },
      { name: 'config', children: [] }
    ]
  },
  {
    name: '/var',
    children: []
  }
])

// 传输进度
const transferProgress = ref({
  show: false,
  percentage: 0,
  status: '',
  message: ''
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
  connectionStatus.value = {
    title: '正在连接...',
    type: 'info',
    description: `正在连接到 ${sftpConfig.value.host}:${sftpConfig.value.port}`
  }

  try {
    // 模拟连接过程
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    isConnected.value = true
    connectionStatus.value = {
      title: '连接成功',
      type: 'success',
      description: `已成功连接到 ${sftpConfig.value.host}`
    }
    
    ElMessage.success('SFTP 连接成功！')
  } catch (error) {
    connectionStatus.value = {
      title: '连接失败',
      type: 'error',
      description: error.message || '无法连接到远程主机'
    }
    ElMessage.error('SFTP 连接失败！')
  } finally {
    connecting.value = false
  }
}

// 断开 SFTP 连接
const disconnectSFTP = async () => {
  try {
    isConnected.value = false
    connectionStatus.value = {
      title: '已断开连接',
      type: 'warning',
      description: 'SFTP 连接已断开'
    }
    ElMessage.info('SFTP 连接已断开')
  } catch (error) {
    ElMessage.error('断开连接时发生错误')
  }
}

// 处理本地文件点击
const handleLocalFileClick = (data) => {
  console.log('本地文件点击:', data)
}

// 处理远程文件点击
const handleRemoteFileClick = (data) => {
  console.log('远程文件点击:', data)
}

// 上传文件
const uploadFile = () => {
  ElMessage.info('文件上传功能需要集成 Electron 文件对话框')
}

// 下载文件
const downloadFile = () => {
  ElMessage.info('文件下载功能需要集成 Electron 文件对话框')
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
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 16px;
  height: 350px;
}

.file-panel h4 {
  margin: 0 0 16px 0;
  color: #606266;
  font-size: 16px;
}

.file-tree {
  height: 280px;
  overflow-y: auto;
}

.transfer-progress {
  margin-top: 20px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 6px;
}

.transfer-progress p {
  margin: 8px 0 0 0;
  text-align: center;
  color: #606266;
}

.status-alert {
  margin-top: 16px;
}
</style>
