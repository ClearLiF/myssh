<template>
  <div class="hosts-list">
    <!-- 顶部标题和操作栏 -->
    <div class="hosts-header">
      <div class="header-title">
        <el-icon><Monitor /></el-icon>
        <span>Hosts</span>
      </div>
      <el-button 
        type="primary" 
        size="small" 
        circle
        @click="showNewHostDialog"
      >
        <el-icon><Plus /></el-icon>
      </el-button>
    </div>

    <!-- 搜索框 -->
    <div class="search-box">
      <el-input
        v-model="searchKeyword"
        placeholder="Find a host or ssh user@hostname..."
        :prefix-icon="Search"
        clearable
        size="small"
      />
    </div>

    <!-- 主机列表 -->
    <div class="hosts-content">
      <div v-if="filteredHosts.length === 0" class="empty-hosts">
        <el-empty description="No hosts" :image-size="80">
          <el-button type="primary" size="small" @click="showNewHostDialog">
            <el-icon><Plus /></el-icon>
            New Host
          </el-button>
        </el-empty>
      </div>

      <el-dropdown
        v-for="(host, index) in filteredHosts"
        :key="index"
        trigger="contextmenu"
        @command="handleContextMenuCommand"
      >
        <div
          class="host-item"
          @dblclick.stop="openConnection(host)"
          @click.stop="selectHost(host, index)"
        >
          <div class="host-icon">
            <el-icon :size="16" :color="getHostColor(host)">
              <Monitor />
            </el-icon>
          </div>
          <div class="host-info">
            <div class="host-name">{{ host.name || `${host.username}@${host.host}` }}</div>
            <div class="host-details">
              <span class="host-address">{{ host.host }}:{{ host.port }}</span>
              <span class="host-user">{{ host.username }}</span>
            </div>
          </div>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item :command="{ action: 'edit', index }">
              <el-icon><Edit /></el-icon>
              编辑
            </el-dropdown-item>
            <el-dropdown-item :command="{ action: 'delete', index }" divided>
              <el-icon><Delete /></el-icon>
              删除
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- 新建/编辑主机对话框 -->
    <el-dialog
      v-model="hostDialogVisible"
      :title="editingHostIndex >= 0 ? '编辑主机' : '新建主机'"
      width="500px"
      @close="resetHostForm"
    >
      <el-form :model="hostForm" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="hostForm.name" placeholder="例如: 生产服务器" />
        </el-form-item>
        <el-form-item label="主机地址" required>
          <el-input v-model="hostForm.host" placeholder="例如: 192.168.1.100" />
        </el-form-item>
        <el-form-item label="端口">
          <el-input-number v-model="hostForm.port" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item label="用户名" required>
          <el-input v-model="hostForm.username" placeholder="SSH 用户名" />
        </el-form-item>
        <el-form-item label="认证方式">
          <el-select v-model="hostForm.authType">
            <el-option label="密码" value="password" />
            <el-option label="私钥" value="privateKey" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="hostForm.authType === 'password'" label="密码">
          <el-input
            v-model="hostForm.password"
            type="password"
            placeholder="SSH 密码"
            show-password
          />
        </el-form-item>
        <el-form-item v-if="hostForm.authType === 'privateKey'" label="私钥文件">
          <el-input v-model="hostForm.privateKeyPath" placeholder="私钥文件路径">
            <template #append>
              <el-button @click="selectPrivateKey">选择</el-button>
            </template>
          </el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="hostDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveHost">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Monitor, Plus, Search, Edit, Delete } from '@element-plus/icons-vue'

const emit = defineEmits(['open-connection'])

// 数据
const hosts = ref([])
const searchKeyword = ref('')
const hostDialogVisible = ref(false)
const editingHostIndex = ref(-1)
const selectedHost = ref(null)
const selectedHostIndex = ref(-1)

// 主机表单
const hostForm = ref({
  name: '',
  host: '',
  port: 22,
  username: '',
  authType: 'password',
  password: '',
  privateKeyPath: ''
})

// 过滤后的主机列表
const filteredHosts = computed(() => {
  if (!searchKeyword.value) return hosts.value
  
  const keyword = searchKeyword.value.toLowerCase()
  return hosts.value.filter(host => {
    const name = (host.name || '').toLowerCase()
    const hostAddress = (host.host || '').toLowerCase()
    const username = (host.username || '').toLowerCase()
    return name.includes(keyword) || 
           hostAddress.includes(keyword) || 
           username.includes(keyword)
  })
})

// 获取主机图标颜色
const getHostColor = (host) => {
  const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399']
  const hash = (host.host + host.username).split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc)
  }, 0)
  return colors[Math.abs(hash) % colors.length]
}

// 加载主机列表
const loadHosts = () => {
  try {
    const saved = localStorage.getItem('ssh-connections')
    if (saved) {
      hosts.value = JSON.parse(saved)
    }
  } catch (error) {
    console.error('加载主机列表失败:', error)
  }
}

// 保存主机列表
const saveHosts = () => {
  try {
    localStorage.setItem('ssh-connections', JSON.stringify(hosts.value))
  } catch (error) {
    console.error('保存主机列表失败:', error)
    ElMessage.error('保存失败')
  }
}

// 显示新建主机对话框
const showNewHostDialog = () => {
  editingHostIndex.value = -1
  resetHostForm()
  hostDialogVisible.value = true
}

// 重置表单
const resetHostForm = () => {
  hostForm.value = {
    name: '',
    host: '',
    port: 22,
    username: '',
    authType: 'password',
    password: '',
    privateKeyPath: ''
  }
}

// 保存主机
const saveHost = () => {
  // 验证
  if (!hostForm.value.name || !hostForm.value.host || !hostForm.value.username) {
    ElMessage.warning('请填写必填项')
    return
  }

  if (hostForm.value.authType === 'password' && !hostForm.value.password) {
    ElMessage.warning('请输入密码')
    return
  }

  if (hostForm.value.authType === 'privateKey' && !hostForm.value.privateKeyPath) {
    ElMessage.warning('请选择私钥文件')
    return
  }

  // 保存或更新
  if (editingHostIndex.value >= 0) {
    hosts.value[editingHostIndex.value] = { ...hostForm.value }
    ElMessage.success('主机已更新')
  } else {
    hosts.value.push({ ...hostForm.value })
    ElMessage.success('主机已添加')
  }

  saveHosts()
  hostDialogVisible.value = false
  resetHostForm()
}

// 选择主机
const selectHost = (host, index) => {
  selectedHost.value = host
  selectedHostIndex.value = index
}

// 处理右键菜单命令
const handleContextMenuCommand = (command) => {
  const { action, index } = command
  selectedHostIndex.value = index
  selectedHost.value = hosts.value[index]
  
  if (action === 'edit') {
    editHost()
  } else if (action === 'delete') {
    deleteHost()
  }
}

// 编辑主机
const editHost = () => {
  if (selectedHostIndex.value >= 0) {
    editingHostIndex.value = selectedHostIndex.value
    hostForm.value = { ...hosts.value[selectedHostIndex.value] }
    hostDialogVisible.value = true
  }
}

// 删除主机
const deleteHost = async () => {
  if (selectedHostIndex.value >= 0) {
    try {
      await ElMessageBox.confirm(
        `确定要删除主机 "${hosts.value[selectedHostIndex.value].name}" 吗？`,
        '确认删除',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
      
      hosts.value.splice(selectedHostIndex.value, 1)
      saveHosts()
      ElMessage.success('主机已删除')
    } catch {
      // 用户取消
    }
  }
}

// 打开连接
const openConnection = (host) => {
  emit('open-connection', host)
}

// 选择私钥文件
const selectPrivateKey = async () => {
  if (window.electronAPI) {
    try {
      const result = await window.electronAPI.dialog.openFile({
        title: '选择私钥文件',
        filters: [
          { name: '私钥文件', extensions: ['pem', 'key', 'rsa'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })
      
      if (result.success) {
        hostForm.value.privateKeyPath = result.filePath
      }
    } catch (error) {
      ElMessage.error('选择文件失败')
    }
  } else {
    ElMessage.info('私钥文件选择功能需要在 Electron 环境中使用')
  }
}

onMounted(() => {
  loadHosts()
})
</script>

<style scoped>
.hosts-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #1a1a1d 0%, #252526 100%);
  color: #e8e8e8;
  position: relative;
}

.hosts-list::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(102, 126, 234, 0.3), transparent);
}

.hosts-header {
  padding: 10px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(60, 60, 60, 0.5);
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
  backdrop-filter: blur(10px);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 12px;
  color: #ffffff;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.header-title .el-icon {
  font-size: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.search-box {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(60, 60, 60, 0.3);
  background: rgba(30, 30, 30, 0.5);
}

.search-box :deep(.el-input__wrapper) {
  background: #3c3c3c;
  box-shadow: none;
}

.search-box :deep(.el-input__inner) {
  color: #cccccc;
}

.hosts-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
}

.empty-hosts {
  padding: 40px 15px;
  text-align: center;
}

.host-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  margin-bottom: 6px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: linear-gradient(135deg, rgba(60, 60, 60, 0.15) 0%, rgba(45, 45, 48, 0.15) 100%);
  border: 1px solid rgba(255, 255, 255, 0.03);
  position: relative;
  overflow: hidden;
  animation: slideInRight 0.3s ease-out;
}

.host-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  opacity: 0;
  transition: opacity 0.3s;
}

.host-item:hover {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.12) 0%, rgba(118, 75, 162, 0.12) 100%);
  border-color: rgba(102, 126, 234, 0.3);
  transform: translateX(4px) scale(1.01);
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.15);
}

.host-item:hover::before {
  opacity: 1;
}

.host-item:active {
  transform: translateX(2px) scale(0.99);
}

.host-icon {
  flex-shrink: 0;
  margin-right: 10px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
  transition: all 0.3s;
}

.host-item:hover .host-icon {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%);
  transform: scale(1.05);
}

.host-icon .el-icon {
  font-size: 16px !important;
}

.host-info {
  flex: 1;
  min-width: 0;
}

.host-name {
  font-size: 12px;
  font-weight: 600;
  color: #f0f0f0;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0.2px;
  transition: color 0.3s;
}

.host-item:hover .host-name {
  color: #ffffff;
}

.host-details {
  display: flex;
  gap: 6px;
  font-size: 10px;
  color: #999;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
}

.host-address,
.host-user {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 3px;
  transition: all 0.3s;
}

.host-item:hover .host-address,
.host-item:hover .host-user {
  background: rgba(255, 255, 255, 0.06);
  color: #bbb;
}

/* 对话框样式调整 */
:deep(.el-dialog) {
  background: #2d2d30;
  border: 1px solid #3c3c3c;
}

:deep(.el-dialog__title) {
  color: #ffffff;
}

:deep(.el-dialog__body) {
  color: #cccccc;
}

:deep(.el-form-item__label) {
  color: #cccccc;
}

:deep(.el-input__wrapper) {
  background: #3c3c3c;
  box-shadow: none;
}

:deep(.el-input__inner) {
  color: #cccccc;
}

:deep(.el-select .el-input__wrapper) {
  background: #3c3c3c;
}
</style>

