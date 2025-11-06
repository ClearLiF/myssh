<template>
  <div class="hosts-list">
    <!-- 顶部标题和操作栏 -->
    <div class="hosts-header">
      <div class="header-title">
        <el-icon><Monitor /></el-icon>
        <span>Hosts</span>
      </div>
      <div class="header-buttons">
        <el-tooltip content="从云端同步" placement="bottom">
          <el-button
            size="small"
            circle
            :loading="syncLoading"
            @click="syncFromCloud"
            title="从云端同步"
          >
            <el-icon><Refresh /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="导入FinalShell连接" placement="bottom">
          <el-button
            size="small"
            circle
            @click="importDialogVisible = true"
            title="导入FinalShell连接"
          >
            <el-icon><Upload /></el-icon>
          </el-button>
        </el-tooltip>
        <el-button
          type="primary"
          size="small"
          circle
          @click="showNewHostDialog"
          title="新增主机"
        >
          <el-icon><Plus /></el-icon>
        </el-button>
        <el-button
          size="small"
          circle
          @click="openSettings"
          title="应用设置"
        >
          <el-icon><Setting /></el-icon>
        </el-button>
      </div>
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
      <div v-if="filteredGroups.length === 0" class="empty-hosts">
        <el-empty description="No hosts" :image-size="80">
          <el-button type="primary" size="small" @click="showNewHostDialog">
            <el-icon><Plus /></el-icon>
            New Host
          </el-button>
        </el-empty>
      </div>

      <!-- 分组列表 -->
      <div v-for="group in filteredGroups" :key="group.name" class="host-group">
        <div class="group-header" @click="toggleGroup(group.name)">
          <el-icon class="group-icon" :class="{ collapsed: !expandedGroups.includes(group.name) }">
            <CaretBottom />
          </el-icon>
          <span class="group-name">{{ group.name }}</span>
          <span class="group-count">{{ group.hosts.length }}</span>
        </div>

        <!-- 分组内的主机 -->
        <div v-show="expandedGroups.includes(group.name)" class="group-hosts">
          <el-dropdown
            v-for="(host, index) in group.hosts"
            :key="`${group.name}-${index}`"
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
                <el-dropdown-item :command="{ action: 'edit', host }">
                  <el-icon><Edit /></el-icon>
                  编辑
                </el-dropdown-item>
                <el-dropdown-item :command="{ action: 'delete', host }" divided>
                  <el-icon><Delete /></el-icon>
                  删除
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </div>

    <!-- 新建/编辑主机对话框 -->
    <el-dialog
      v-model="hostDialogVisible"
      :title="editingHostIndex >= 0 ? '编辑主机' : '新建主机'"
      width="650px"
      @close="resetHostForm"
    >
      <el-tabs type="border-card">
        <!-- 基本信息标签 -->
        <el-tab-pane label="基本信息">
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
            <el-form-item v-if="hostForm.authType === 'privateKey'" label="私钥内容" required>
              <el-input 
                v-model="hostForm.privateKeyContent" 
                type="textarea"
                :rows="6"
                placeholder="请粘贴私钥内容，例如：&#10;-----BEGIN PRIVATE KEY-----&#10;MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...&#10;-----END PRIVATE KEY-----"
              />
              <div class="key-input-actions">
                <el-button size="small" @click="selectPrivateKeyFile">
                  从文件加载
                </el-button>
                <el-button size="small" @click="clearPrivateKey">
                  清空
                </el-button>
              </div>
              <!-- 实时显示私钥状态 -->
              <div class="key-status" v-if="hostForm.authType === 'privateKey'">
                <small>
                  私钥状态: {{ hostForm.privateKeyContent ? `已加载 (${hostForm.privateKeyContent.length} 字符)` : '未加载' }}
                </small>
              </div>
            </el-form-item>
            <el-form-item v-if="hostForm.authType === 'privateKey'" label="私钥密码">
              <el-input 
                v-model="hostForm.privateKeyPassphrase" 
                type="password" 
                placeholder="私钥密码（可选）"
                show-password
              />
            </el-form-item>
            <el-form-item label="分组">
              <el-select 
                v-model="hostForm.group" 
                allow-create 
                filterable 
                default-first-option 
                placeholder="选择或直接输入新分组"
              >
                <el-option
                  v-for="group in getAllGroups"
                  :key="group"
                  :label="group"
                  :value="group"
                />
              </el-select>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 端口转发标签 -->
        <el-tab-pane>
          <template #label>
            <span>
              端口转发
              <el-badge v-if="hostForm.tunnels && hostForm.tunnels.length > 0" :value="hostForm.tunnels.length" type="primary" />
            </span>
          </template>
          <div class="tunnels-panel">
            <div class="tunnels-header">
              <el-button type="primary" size="small" @click="showNewTunnelDialog">
                <el-icon><Plus /></el-icon>
                新建隧道
              </el-button>
            </div>

            <!-- 隧道列表 -->
            <el-table :data="hostForm.tunnels || []" stripe style="width: 100%" size="small">
              <el-table-column prop="name" label="名称" width="120" />
              <el-table-column prop="type" label="类型" width="80">
                <template #default="scope">
                  <el-tag v-if="scope.row.type === 'local'" type="success" size="small">本地</el-tag>
                  <el-tag v-else-if="scope.row.type === 'remote'" type="warning" size="small">远程</el-tag>
                  <el-tag v-else type="info" size="small">动态</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="监听" width="140">
                <template #default="scope">
                  <span v-if="scope.row.type !== 'dynamic'">{{ scope.row.listenHost }}:{{ scope.row.listenPort }}</span>
                  <span v-else>{{ scope.row.listenHost }}:{{ scope.row.listenPort }} (SOCKS5)</span>
                </template>
              </el-table-column>
              <el-table-column label="目标" min-width="140">
                <template #default="scope">
                  <span v-if="scope.row.type !== 'dynamic'">{{ scope.row.targetHost }}:{{ scope.row.targetPort }}</span>
                  <span v-else>-</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="120" fixed="right">
                <template #default="scope">
                  <el-button type="primary" size="small" link @click="editTunnel(scope.$index)">
                    <el-icon><Edit /></el-icon>
                  </el-button>
                  <el-button type="danger" size="small" link @click="deleteTunnel(scope.$index)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </template>
              </el-table-column>
            </el-table>

            <el-empty v-if="!hostForm.tunnels || hostForm.tunnels.length === 0" description="还没有配置端口转发" :image-size="60" />
          </div>
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <div class="dialog-footer">
          <div class="left-actions">
            <el-button 
              type="info" 
              @click="testConnection" 
              :loading="testingConnection"
              :disabled="!isHostFormValid"
            >
              <el-icon><Monitor /></el-icon>
              测试连接
            </el-button>
          </div>
          <div class="right-actions">
            <el-button @click="hostDialogVisible = false">取消</el-button>
            <el-button type="primary" @click="saveHost">保存</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- 新建/编辑隧道对话框 -->
    <el-dialog
      v-model="tunnelDialogVisible"
      :title="editingTunnelIndex >= 0 ? '编辑隧道' : '新建隧道'"
      width="450px"
      @close="resetTunnelForm"
    >
      <el-form :model="tunnelForm" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="tunnelForm.name" placeholder="例如: MySQL隧道" />
        </el-form-item>
        <el-form-item label="类型" required>
          <el-select v-model="tunnelForm.type" @change="handleTunnelTypeChange">
            <el-option label="本地转发" value="local">
              <div>
                <div>本地转发 (-L)</div>
                <div style="font-size: 12px; color: var(--el-text-color-secondary)">本地端口 → 远程目标</div>
              </div>
            </el-option>
            <el-option label="远程转发" value="remote">
              <div>
                <div>远程转发 (-R)</div>
                <div style="font-size: 12px; color: var(--el-text-color-secondary)">远程端口 → 本地目标</div>
              </div>
            </el-option>
            <el-option label="动态转发" value="dynamic">
              <div>
                <div>动态转发 (-D)</div>
                <div style="font-size: 12px; color: var(--el-text-color-secondary)">SOCKS5 代理</div>
              </div>
            </el-option>
          </el-select>
        </el-form-item>

        <el-divider content-position="left">监听端</el-divider>
        <el-form-item label="绑定IP" required>
          <el-input v-model="tunnelForm.listenHost" placeholder="127.0.0.1" />
        </el-form-item>
        <el-form-item label="监听端口" required>
          <el-input-number v-model="tunnelForm.listenPort" :min="1" :max="65535" style="width: 100%" />
        </el-form-item>

        <template v-if="tunnelForm.type !== 'dynamic'">
          <el-divider content-position="left">目标端</el-divider>
          <el-form-item label="目标地址" required>
            <el-input v-model="tunnelForm.targetHost" placeholder="127.0.0.1 或目标主机" />
          </el-form-item>
          <el-form-item label="目标端口" required>
            <el-input-number v-model="tunnelForm.targetPort" :min="1" :max="65535" style="width: 100%" />
          </el-form-item>
        </template>
      </el-form>

      <template #footer>
        <el-button @click="tunnelDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveTunnel">确定</el-button>
      </template>
    </el-dialog>

    <!-- Toast 通知组件 -->
    <ToastNotification ref="toast" />

    <!-- 导入FinalShell连接对话框 -->
    <ImportFinalShellDialog
      v-model:visible="importDialogVisible"
      @import-success="handleImportSuccess"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Monitor, Plus, Search, Edit, Delete, Setting, CaretBottom, Refresh, Upload } from '@element-plus/icons-vue'
import { authAPI, sshListAPI } from '../services/api'
import ToastNotification from './ToastNotification.vue'
import ImportFinalShellDialog from './ImportFinalShellDialog.vue'

const emit = defineEmits(['open-connection', 'open-settings'])

// 数据
const hosts = ref([])
const searchKeyword = ref('')
const hostDialogVisible = ref(false)
const importDialogVisible = ref(false)
const editingHostIndex = ref(-1)
const selectedHost = ref(null)
const selectedHostIndex = ref(-1)
const expandedGroups = ref(['default']) // 默认展开 default 分组
const syncLoading = ref(false) // 同步加载状态
const useCloud = ref(false) // 是否使用云端存储
const toast = ref(null) // Toast 通知组件引用
const testingConnection = ref(false) // 测试连接状态

// 主机表单
const hostForm = ref({
  name: '',
  host: '',
  port: 22,
  username: '',
  authType: 'password',
  password: '',
  privateKeyContent: '',
  privateKeyPassphrase: '',
  group: 'default', // 新增分组字段
  tunnels: [] // SSH隧道列表
})

// 隧道对话框
const tunnelDialogVisible = ref(false)
const editingTunnelIndex = ref(-1)
const tunnelForm = ref({
  name: '',
  type: 'local', // local, remote, dynamic
  listenHost: '127.0.0.1',
  listenPort: '',
  targetHost: '127.0.0.1',
  targetPort: ''
})

// 过滤后的分组列表
const filteredGroups = computed(() => {
  // 先按分组分类
  const groupMap = new Map()

  hosts.value.forEach(host => {
    const groupName = host.group || 'default'
    if (!groupMap.has(groupName)) {
      groupMap.set(groupName, [])
    }
    groupMap.get(groupName).push(host)
  })

  // 再过滤搜索
  if (!searchKeyword.value) {
    return Array.from(groupMap, ([name, hosts]) => ({ name, hosts }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  const keyword = searchKeyword.value.toLowerCase()
  const filtered = Array.from(groupMap, ([name, hosts]) => {
    const filteredHosts = hosts.filter(host => {
      const hostName = (host.name || '').toLowerCase()
      const hostAddress = (host.host || '').toLowerCase()
      const username = (host.username || '').toLowerCase()
      return hostName.includes(keyword) ||
             hostAddress.includes(keyword) ||
             username.includes(keyword)
    })
    return { name, hosts: filteredHosts }
  }).filter(group => group.hosts.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name))

  return filtered
})

// 获取所有分组名称
const getAllGroups = computed(() => {
  const groups = new Set(['default'])
  hosts.value.forEach(host => {
    if (host.group) groups.add(host.group)
  })
  return Array.from(groups).sort()
})

// 主机表单验证
const isHostFormValid = computed(() => {
  const { name, host, username, authType, password, privateKeyContent } = hostForm.value
  
  // 基本字段验证
  if (!name?.trim() || !host?.trim() || !username?.trim()) {
    return false
  }
  
  // 认证方式验证
  if (authType === 'password') {
    return !!password
  } else if (authType === 'privateKey') {
    return !!privateKeyContent?.trim()
  }
  
  return false
})

// 获取主机图标颜色
const getHostColor = (host) => {
  const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399']
  const hash = (host.host + host.username).split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc)
  }, 0)
  return colors[Math.abs(hash) % colors.length]
}

// 切换分组展开/折叠
const toggleGroup = (groupName) => {
  const index = expandedGroups.value.indexOf(groupName)
  if (index > -1) {
    expandedGroups.value.splice(index, 1)
  } else {
    expandedGroups.value.push(groupName)
  }
}

// 加载主机列表
const loadHosts = async () => {
  try {
    // 检查是否已登录且使用云端
    if (authAPI.isAuthenticated()) {
      useCloud.value = true
      // 从云端加载
      const result = await sshListAPI.getList()
      if (result.success) {
        hosts.value = result.data || []
        console.log('已从云端加载主机列表:', hosts.value.length)
        console.log('云端数据详情:', hosts.value)
        return
      } else {
        console.warn('从云端加载失败，尝试本地加载:', result.error)
        useCloud.value = false
      }
    }

    // 从本地加载
    if (window.connectionAPI) {
      const result = await window.connectionAPI.loadConnections()
      if (result.success) {
        hosts.value = result.connections
        console.log('已从本地加载主机列表:', hosts.value.length)
        console.log('本地数据详情:', hosts.value)
      } else {
        console.error('加载主机列表失败:', result.message)
        hosts.value = []
      }
    } else {
      // 降级到 localStorage
      const saved = localStorage.getItem('ssh-connections')
      if (saved) {
        hosts.value = JSON.parse(saved)
      }
    }
  } catch (error) {
    console.error('加载主机列表失败:', error)
  }
}

// 保存主机列表
const saveHosts = async () => {
  try {
    // 创建可序列化的副本，只包含需要的字段
    const serializedHosts = hosts.value.map(host => ({
      id: host.id,
      name: host.name,
      host: host.host,
      port: host.port,
      username: host.username,
      authType: host.authType,
      password: host.password,
      privateKeyContent: host.privateKeyContent,
      privateKeyPassphrase: host.privateKeyPassphrase,
      group: host.group // 保存分组
    }))
    
    console.log('准备保存的主机配置:', serializedHosts)
    
    // 检查私钥内容是否被意外清空
    serializedHosts.forEach((host, index) => {
      if (host.authType === 'privateKey') {
        console.log(`主机 ${index} (${host.name}) 私钥检查:`)
        console.log('  - privateKeyContent 长度:', host.privateKeyContent ? host.privateKeyContent.length : 0)
        console.log('  - privateKeyContent 是否为空字符串:', host.privateKeyContent === '')
        console.log('  - privateKeyContent 是否为null:', host.privateKeyContent === null)
        console.log('  - privateKeyContent 是否为undefined:', host.privateKeyContent === undefined)
        
        if (!host.privateKeyContent || host.privateKeyContent.trim() === '') {
          console.warn('⚠️ 警告: 私钥内容为空，这可能导致连接失败')
        }
      }
    })

    // 如果已登录，保存到云端
    if (useCloud.value && authAPI.isAuthenticated()) {
      const savePromises = []

      for (const host of serializedHosts) {
        if (host.id) {
          // 更新现有主机
          savePromises.push(sshListAPI.update(host.id, host))
        } else {
          // 添加新主机
          savePromises.push(sshListAPI.add(host))
        }
      }

      const results = await Promise.all(savePromises)
      const allSuccess = results.every(r => r.success)

      if (allSuccess) {
        toast.value?.success('主机列表已同步到云端', '同步成功')
        // 重新加载以获取最新的 ID
        await loadHosts()
        return
      } else {
        console.warn('部分主机同步失败，尝试本地保存')
      }
    }

    // 保存到本地
    if (window.connectionAPI) {
      const result = await window.connectionAPI.saveConnections(serializedHosts)
      if (result.success) {
        toast.value?.success('主机列表已保存', '保存成功')
        console.log('主机列表已保存')
      } else {
        console.error('保存主机列表失败:', result.message)
        toast.value?.error('保存失败: ' + result.message, '保存失败')
      }
    } else {
      // 降级到 localStorage
      localStorage.setItem('ssh-connections', JSON.stringify(hosts.value))
      toast.value?.success('主机列表已保存', '保存成功')
    }
  } catch (error) {
    console.error('保存主机列表失败:', error)
    toast.value?.error('保存失败', '保存失败')
  }
}

// 从云端同步
const syncFromCloud = async () => {
  if (!authAPI.isAuthenticated()) {
    toast.value?.warning('请先登录以使用云端同步功能', '登录提示')
    return
  }

  try {
    syncLoading.value = true
    const result = await sshListAPI.getList()

    if (result.success) {
      hosts.value = result.data || []
      useCloud.value = true
      toast.value?.success(`已同步 ${hosts.value.length} 个主机配置`, '同步成功')
    } else {
      toast.value?.error('同步失败: ' + result.error, '同步失败')
    }
  } catch (error) {
    console.error('同步失败:', error)
    toast.value?.error('同步失败', '同步失败')
  } finally {
    syncLoading.value = false
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
    privateKeyContent: '',
    privateKeyPassphrase: '',
    group: 'default', // 重置分组
    tunnels: [] // 重置隧道
  }
}

// 重置隧道表单
const resetTunnelForm = () => {
  tunnelForm.value = {
    name: '',
    type: 'local',
    listenHost: '127.0.0.1',
    listenPort: '',
    targetHost: '127.0.0.1',
    targetPort: ''
  }
}

// 显示新建隧道对话框
const showNewTunnelDialog = () => {
  editingTunnelIndex.value = -1
  resetTunnelForm()
  tunnelDialogVisible.value = true
}

// 编辑隧道
const editTunnel = (index) => {
  editingTunnelIndex.value = index
  tunnelForm.value = { ...hostForm.value.tunnels[index] }
  tunnelDialogVisible.value = true
}

// 删除隧道
const deleteTunnel = (index) => {
  ElMessageBox.confirm(
    `确定要删除隧道 "${hostForm.value.tunnels[index].name}" 吗？`,
    '确认删除',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    if (!hostForm.value.tunnels) hostForm.value.tunnels = []
    hostForm.value.tunnels.splice(index, 1)
    toast.value?.success('隧道已删除', '删除成功')
  }).catch(() => {})
}

// 保存隧道
const saveTunnel = () => {
  // 验证
  if (!tunnelForm.value.name || !tunnelForm.value.listenPort) {
    toast.value?.warning('请填写完整信息', '输入提示')
    return
  }

  if (tunnelForm.value.type !== 'dynamic' && (!tunnelForm.value.targetHost || !tunnelForm.value.targetPort)) {
    toast.value?.warning('请填写目标地址和端口', '输入提示')
    return
  }

  if (!hostForm.value.tunnels) {
    hostForm.value.tunnels = []
  }

  if (editingTunnelIndex.value >= 0) {
    // 编辑模式
    hostForm.value.tunnels[editingTunnelIndex.value] = { ...tunnelForm.value }
    toast.value?.success('隧道已更新', '更新成功')
  } else {
    // 新建模式
    hostForm.value.tunnels.push({ ...tunnelForm.value })
    toast.value?.success('隧道已添加', '添加成功')
  }

  tunnelDialogVisible.value = false
  resetTunnelForm()
}

// 隧道类型改变时
const handleTunnelTypeChange = () => {
  // 动态转发不需要目标地址和端口
  if (tunnelForm.value.type === 'dynamic') {
    tunnelForm.value.targetHost = ''
    tunnelForm.value.targetPort = ''
  } else if (!tunnelForm.value.targetHost) {
    tunnelForm.value.targetHost = '127.0.0.1'
  }
}

// 保存主机
const saveHost = async () => {
  // 验证
  if (!hostForm.value.name || !hostForm.value.host || !hostForm.value.username) {
    toast.value?.warning('请填写必填项', '输入提示')
    return
  }

  if (hostForm.value.authType === 'password' && !hostForm.value.password) {
    toast.value?.warning('请输入密码', '输入提示')
    return
  }

  if (hostForm.value.authType === 'privateKey' && !hostForm.value.privateKeyContent.trim()) {
    toast.value?.warning('请输入私钥内容', '输入提示')
    return
  }

  // 验证私钥内容
  if (hostForm.value.authType === 'privateKey') {
    console.log('保存前私钥验证:')
    console.log('  - privateKeyContent 长度:', hostForm.value.privateKeyContent ? hostForm.value.privateKeyContent.length : 0)
    console.log('  - privateKeyContent 类型:', typeof hostForm.value.privateKeyContent)
    console.log('  - privateKeyContent 前100字符:', hostForm.value.privateKeyContent ? hostForm.value.privateKeyContent.substring(0, 100) : 'null')
  }

  // 保存或更新
  if (editingHostIndex.value >= 0) {
    hosts.value[editingHostIndex.value] = { ...hostForm.value }
    console.log('更新主机配置:', hosts.value[editingHostIndex.value])
    toast.value?.success('主机已更新', '更新成功')
  } else {
    hosts.value.push({ ...hostForm.value })
    console.log('添加主机配置:', hostForm.value)
    toast.value?.success('主机已添加', '添加成功')
  }

  await saveHosts()
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
  const { action, host } = command
  selectedHostIndex.value = hosts.value.findIndex(h => h === host)
  selectedHost.value = host

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
    const hostData = hosts.value[selectedHostIndex.value]
    console.log('编辑主机 - 原始数据:', hostData)
    hostForm.value = { ...hostData }
    console.log('编辑主机 - 表单数据:', hostForm.value)
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

      const host = hosts.value[selectedHostIndex.value]

      // 如果使用云端且主机有 ID，从云端删除
      if (useCloud.value && authAPI.isAuthenticated() && host.id) {
        const result = await sshListAPI.delete(host.id)
        if (result.success) {
          toast.value?.success('主机已从云端删除', '删除成功')
        } else {
          console.warn('从云端删除失败:', result.error)
        }
      }

      hosts.value.splice(selectedHostIndex.value, 1)
      await saveHosts()
      toast.value?.success('主机已删除', '删除成功')
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
// 从文件加载私钥
const selectPrivateKeyFile = async () => {
  if (window.electronAPI) {
    try {
      const result = await window.electronAPI.dialog.openFile({
        title: '选择私钥文件',
        filters: [
          { name: '私钥文件', extensions: ['pem', 'key', 'rsa', 'ppk'] },
          { name: 'PEM文件', extensions: ['pem'] },
          { name: 'OpenSSH私钥', extensions: ['key', 'rsa'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })

      if (result.success) {
        console.log('选择的文件路径:', result.filePath)
        // 读取文件内容
        const fileContent = await window.electronAPI.fs.readFile(result.filePath)
        console.log('文件读取结果:', fileContent)
        
        if (fileContent.success) {
          console.log('文件内容长度:', fileContent.content ? fileContent.content.length : 0)
          console.log('文件内容前100字符:', fileContent.content ? fileContent.content.substring(0, 100) : 'null')
          
          hostForm.value.privateKeyContent = fileContent.content
          console.log('设置后 hostForm.privateKeyContent 长度:', hostForm.value.privateKeyContent ? hostForm.value.privateKeyContent.length : 0)
          
          toast.value?.success('私钥内容已加载', '加载成功')
          
          // 检查私钥格式并给出提示
          const content = fileContent.content.toLowerCase()
          if (content.includes('begin openssh private key')) {
            toast.value?.info('检测到OpenSSH格式私钥，建议转换为PEM格式以获得更好兼容性', '格式提示')
          } else if (content.includes('begin rsa private key') || content.includes('begin private key')) {
            toast.value?.success('私钥格式正确', '格式验证')
          } else {
            toast.value?.warning('私钥格式可能不正确，请确保是有效的私钥文件', '格式警告')
          }
        } else {
          console.error('读取文件失败:', fileContent)
          toast.value?.error('读取文件失败：' + fileContent.message, '读取失败')
        }
      }
    } catch (error) {
      toast.value?.error('加载文件失败', '文件加载失败')
    }
  } else {
    toast.value?.info('文件加载功能需要在 Electron 环境中使用', '功能提示')
  }
}

// 清空私钥内容
const clearPrivateKey = () => {
  console.log('清空前 privateKeyContent 长度:', hostForm.value.privateKeyContent ? hostForm.value.privateKeyContent.length : 0)
  hostForm.value.privateKeyContent = ''
  console.log('清空后 privateKeyContent 长度:', hostForm.value.privateKeyContent ? hostForm.value.privateKeyContent.length : 0)
  toast.value?.info('私钥内容已清空', '清空成功')
}

// 测试连接
const testConnection = async () => {
  if (!isHostFormValid.value) {
    toast.value?.warning('请先完善主机配置信息', '配置不完整')
    return
  }

  testingConnection.value = true
  
  try {
    if (window.electronAPI) {
      // 创建测试配置
      const testConfig = {
        host: hostForm.value.host,
        port: hostForm.value.port,
        username: hostForm.value.username,
        authType: hostForm.value.authType,
        password: hostForm.value.password,
        privateKeyContent: hostForm.value.privateKeyContent,
        privateKeyPassphrase: hostForm.value.privateKeyPassphrase
      }
      
      console.log('开始测试连接:', { host: testConfig.host, port: testConfig.port, username: testConfig.username, authType: testConfig.authType })
      
      const result = await window.electronAPI.ssh.connect(testConfig)
      
      if (result.success) {
        toast.value?.success(`连接测试成功！连接ID: ${result.connectionId}`, '测试成功')
        
        // 测试成功后立即断开连接
        try {
          await window.electronAPI.ssh.disconnect(result.connectionId)
          console.log('测试连接已断开')
        } catch (disconnectError) {
          console.warn('断开测试连接失败:', disconnectError)
        }
      } else {
        toast.value?.error(`连接测试失败: ${result.message}`, '测试失败')
      }
    } else {
      toast.value?.warning('连接测试功能需要在 Electron 环境中使用', '功能提示')
    }
  } catch (error) {
    console.error('连接测试出错:', error)
    toast.value?.error(`连接测试出错: ${error.message}`, '测试出错')
  } finally {
    testingConnection.value = false
  }
}

// 测试私钥内容设置
const testPrivateKeyContent = () => {
  console.log('=== 私钥内容测试 ===')
  console.log('当前 hostForm.privateKeyContent:', hostForm.value.privateKeyContent)
  
  // 设置测试内容
  const testContent = '-----BEGIN PRIVATE KEY-----\nTEST_CONTENT\n-----END PRIVATE KEY-----'
  hostForm.value.privateKeyContent = testContent
  
  console.log('设置测试内容后:', hostForm.value.privateKeyContent)
  console.log('内容是否匹配:', hostForm.value.privateKeyContent === testContent)
}

// 暴露测试函数到全局
if (typeof window !== 'undefined') {
  window.testPrivateKeyContent = testPrivateKeyContent
}

// 打开设置
const openSettings = () => {
  emit('open-settings')
}

// 处理导入成功
const handleImportSuccess = async (result) => {
  toast.value?.success(
    `导入完成！\n新增: ${result.added} 个连接\n跳过: ${result.skipped} 个重复连接\n总连接数: ${result.total}`,
    '导入成功'
  )
  
  // 重新加载主机列表
  await loadHosts()
}

// 调试函数 - 检查私钥保存状态
const debugPrivateKey = () => {
  console.log('=== 私钥调试信息 ===')
  console.log('当前主机列表:', hosts.value)
  console.log('当前表单数据:', hostForm.value)
  
  hosts.value.forEach((host, index) => {
    if (host.authType === 'privateKey') {
      console.log(`主机 ${index} (${host.name}):`)
      console.log('  - authType:', host.authType)
      console.log('  - privateKeyContent 长度:', host.privateKeyContent ? host.privateKeyContent.length : 0)
      console.log('  - privateKeyContent 前50字符:', host.privateKeyContent ? host.privateKeyContent.substring(0, 50) : 'null')
    }
  })
}

// 暴露调试函数到全局
if (typeof window !== 'undefined') {
  window.debugPrivateKey = debugPrivateKey
}

onMounted(async () => {
  await loadHosts()
})
</script>

<style scoped>
.hosts-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  color: var(--text-primary);
  position: relative;
  transition: background-color 0.3s ease, color 0.3s ease;
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
  border-bottom: 1px solid var(--border-color-light);
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
  backdrop-filter: blur(10px);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 12px;
  color: var(--text-primary);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  transition: color 0.3s ease;
}

.header-title .el-icon {
  font-size: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.header-buttons {
  display: flex;
  gap: 8px;
}

.search-box {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color-light);
  background: var(--bg-tertiary);
  transition: background-color 0.3s ease;
}

.search-box :deep(.el-input__wrapper) {
  background: var(--input-bg);
  box-shadow: none;
  transition: background-color 0.3s ease;
}

.search-box :deep(.el-input__inner) {
  color: var(--text-primary);
  transition: color 0.3s ease;
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

.host-group {
  margin-bottom: 10px;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(102, 126, 234, 0.05);
  border: 1px solid var(--border-color-light);
  position: relative;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.group-header {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  background: rgba(102, 126, 234, 0.08);
  border-bottom: 1px solid var(--border-color-light);
  transition: background 0.3s;
}

.group-header:hover {
  background: rgba(102, 126, 234, 0.12);
}

.group-header .group-icon {
  font-size: 16px;
  margin-right: 8px;
  color: var(--text-secondary);
  transition: transform 0.3s;
}

.group-header .group-icon.collapsed {
  transform: rotate(-90deg);
}

.group-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  margin-right: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0.2px;
  transition: color 0.3s;
}

.group-count {
  font-size: 10px;
  color: var(--text-secondary);
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
}

.group-hosts {
  padding: 0 12px 10px;
  transition: max-height 0.3s ease-in-out;
  overflow: hidden;
}

.host-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  margin-bottom: 6px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: rgba(102, 126, 234, 0.05);
  border: 1px solid var(--border-color-light);
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
  background: rgba(102, 126, 234, 0.12);
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
  background: rgba(102, 126, 234, 0.1);
  transition: all 0.3s;
}

.host-item:hover .host-icon {
  background: rgba(102, 126, 234, 0.2);
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
  color: var(--text-primary);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0.2px;
  transition: color 0.3s;
}

.host-item:hover .host-name {
  color: var(--accent-color);
}

.host-details {
  display: flex;
  gap: 6px;
  font-size: 10px;
  color: var(--text-secondary);
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  transition: color 0.3s;
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
  color: var(--text-primary);
}

/* 对话框样式调整 */
:deep(.el-dialog) {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  transition: background-color 0.3s ease;
}

:deep(.el-dialog__title) {
  color: var(--text-primary);
  transition: color 0.3s ease;
}

:deep(.el-dialog__body) {
  color: var(--text-primary);
  transition: color 0.3s ease;
}

:deep(.el-form-item__label) {
  color: var(--text-primary);
}

:deep(.el-input__wrapper) {
  background: var(--input-bg);
  box-shadow: none;
}

:deep(.el-input__inner) {
  color: var(--text-primary);
}

:deep(.el-select .el-input__wrapper) {
  background: var(--input-bg);
}

/* 隧道面板样式 */
.tunnels-panel {
  padding: 16px;
  min-height: 300px;
}

.tunnels-header {
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tunnels-panel :deep(.el-table) {
  background: transparent;
}

.tunnels-panel :deep(.el-table th),
.tunnels-panel :deep(.el-table tr) {
  background: transparent;
}

.tunnels-panel :deep(.el-table td),
.tunnels-panel :deep(.el-table th) {
  border-color: var(--border-color-light);
  color: var(--text-primary);
}

.tunnels-panel :deep(.el-table__empty-text) {
  color: var(--text-secondary);
}

/* 私钥输入操作按钮 */
.key-input-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}

.key-input-actions .el-button {
  font-size: 12px;
}

.key-status {
  margin-top: 4px;
  padding: 4px 8px;
  background: var(--el-color-info-light-9);
  border-radius: 4px;
  border-left: 3px solid var(--el-color-info);
}

.key-status small {
  color: var(--text-secondary);
  font-size: 11px;
}

/* 对话框底部布局 */
.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.left-actions {
  display: flex;
  gap: 8px;
}

.right-actions {
  display: flex;
  gap: 8px;
}
</style>

