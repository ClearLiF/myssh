<template>
  <div class="settings-tab">
    <!-- 账户管理 -->
    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>账户管理</span>
        </div>
      </template>

      <el-form label-width="150px">
        <el-form-item label="登录状态">
          <el-tag v-if="isAuthenticated" type="success">已登录</el-tag>
          <el-tag v-else type="info">未登录</el-tag>
        </el-form-item>

        <el-form-item v-if="isAuthenticated && userInfo" label="用户名">
          <el-text>{{ userInfo.username || '未知' }}</el-text>
        </el-form-item>

        <el-form-item v-if="isAuthenticated && userInfo && userInfo.email" label="邮箱">
          <el-text>{{ userInfo.email }}</el-text>
        </el-form-item>

        <el-divider />

        <el-form-item label="API 地址">
          <div class="path-input-group">
            <el-input 
              v-model="apiSettings.baseURL" 
              placeholder="http://localhost:8080"
              class="path-input"
            />
            <el-button type="primary" @click="saveApiConfig">
              <el-icon><Check /></el-icon>
              保存
            </el-button>
          </div>
        </el-form-item>

        <el-form-item label="说明">
          <el-text type="info">配置后端 API 的基础地址，用于云端同步 SSH 列表</el-text>
        </el-form-item>

        <el-divider />

        <el-form-item label="自定义请求头">
          <div class="headers-config">
            <div 
              v-for="(header, index) in customHeaders" 
              :key="index"
              class="header-item-row"
            >
              <el-input
                v-model="header.key"
                placeholder="请求头名称 (如: X-Custom-Key)"
                style="width: 200px; margin-right: 8px;"
                size="small"
              />
              <el-input
                v-model="header.value"
                placeholder="请求头值"
                style="width: 200px; margin-right: 8px;"
                size="small"
              />
              <el-button 
                type="danger" 
                size="small"
                circle
                @click="removeHeader(index)"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            
            <el-button 
              type="primary" 
              size="small"
              @click="addHeader"
            >
              <el-icon><Plus /></el-icon>
              添加请求头
            </el-button>
          </div>
        </el-form-item>

        <el-form-item label="说明">
          <el-text type="info">自定义请求头会添加到所有 API 请求中，常用于特殊认证或跨域配置</el-text>
        </el-form-item>

        <el-divider />

        <el-form-item v-if="isAuthenticated">
          <el-button type="danger" @click="handleLogout">
            <el-icon><SwitchButton /></el-icon>
            退出登录
          </el-button>
        </el-form-item>

        <el-form-item v-if="!isAuthenticated">
          <el-button type="primary" @click="showLogin">
            <el-icon><User /></el-icon>
            登录账号
          </el-button>
          <el-text type="info" style="margin-left: 12px;">
            登录后可使用云端同步功能
          </el-text>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>应用设置</span>
        </div>
      </template>

      <!-- 连接配置保存位置 -->
      <el-form :model="settings" label-width="150px">
        <el-form-item label="连接配置保存位置">
          <div class="path-input-group">
            <el-input 
              v-model="settings.connectionsPath" 
              readonly
              placeholder="连接配置保存位置"
              class="path-input"
            />
            <el-button type="primary" @click="selectConnectionsPath">
              <el-icon><Edit /></el-icon>
              选择
            </el-button>
            <el-button @click="openConnectionsFolder">
              <el-icon><Folder /></el-icon>
              打开
            </el-button>
          </div>
        </el-form-item>

        <el-form-item label="说明">
          <el-text type="info">SSH 连接配置文件 (connections.json) 的保存位置</el-text>
        </el-form-item>

        <el-divider />

        <el-form-item label="下载位置">
          <div class="path-input-group">
            <el-input 
              v-model="settings.downloadPath" 
              readonly
              placeholder="选择下载位置"
              class="path-input"
            />
            <el-button type="primary" @click="selectDownloadPath">
              <el-icon><Edit /></el-icon>
              选择
            </el-button>
            <el-button @click="openDownloadFolder">
              <el-icon><Folder /></el-icon>
              打开
            </el-button>
          </div>
        </el-form-item>

        <el-form-item label="说明">
          <el-text type="info">SFTP 文件下载的默认保存位置</el-text>
        </el-form-item>

        <el-divider />

        <el-form-item label="临时文件目录">
          <div class="path-input-group">
            <el-input 
              v-model="settings.tempPath" 
              readonly
              placeholder="选择临时文件目录"
              class="path-input"
            />
            <el-button type="primary" @click="selectTempPath">
              <el-icon><Edit /></el-icon>
              选择
            </el-button>
            <el-button @click="openTempFolder">
              <el-icon><Folder /></el-icon>
              打开
            </el-button>
          </div>
        </el-form-item>

        <el-form-item label="说明">
          <el-text type="info">用于编辑器打开文件时的临时存储位置</el-text>
        </el-form-item>

        <el-divider />

        <el-form-item label="默认编辑器">
          <div class="path-input-group">
            <el-input 
              v-model="settings.editorPath" 
              readonly
              placeholder="选择编辑器应用"
              class="path-input"
            />
            <el-button type="primary" @click="selectEditor">
              <el-icon><Edit /></el-icon>
              选择
            </el-button>
          </div>
        </el-form-item>

        <el-form-item label="说明">
          <el-text type="info">
            用于打开和编辑远程文件的本地编辑器（如 VS Code、Sublime Text 等）<br/>
            <span style="font-size: 12px; margin-top: 8px; display: block;">
              常见编辑器路径：<br/>
              • macOS: /Applications/Visual Studio Code.app<br/>
              • Windows: C:\Users\[用户名]\AppData\Local\Programs\Microsoft VS Code\Code.exe<br/>
              • Linux: /usr/bin/code 或 /usr/bin/sublime 等
            </span>
          </el-text>
        </el-form-item>

        <el-divider />

        <el-form-item label="应用主题">
          <el-radio-group v-model="settings.theme" @change="handleThemeChange">
            <el-radio label="dark">
              🌙 暗色主题
            </el-radio>
            <el-radio label="light">
              ☀️ 明亮主题
            </el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="说明">
          <el-text type="info">选择应用的配色方案，更改后立即生效</el-text>
        </el-form-item>

        <el-divider />

        <el-form-item label="终端字体大小">
          <div class="font-size-control">
            <el-slider 
              v-model="settings.terminalFontSize" 
              :min="8" 
              :max="32"
              :step="1"
              show-input
              :show-input-controls="true"
              @change="handleFontSizeChange"
              style="width: 400px;"
            />
            <el-text type="info" style="margin-left: 16px;">
              预览：<span :style="{ fontSize: settings.terminalFontSize + 'px', fontFamily: 'monospace' }">Hello World! 你好世界</span>
            </el-text>
          </div>
        </el-form-item>

        <el-form-item label="说明">
          <el-text type="info">调整 SSH 终端的字体大小（8-32），更改后新连接生效</el-text>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 关于信息 -->
    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>关于</span>
        </div>
      </template>

      <el-descriptions :column="1">
        <el-descriptions-item label="应用名称">MySSH</el-descriptions-item>
        <el-descriptions-item label="版本">1.0.0</el-descriptions-item>
        <el-descriptions-item label="开发框架">Electron + Vue 3 + Element Plus</el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Folder, Edit, Check, SwitchButton, User, Plus, Delete } from '@element-plus/icons-vue'
import { authAPI, apiConfig } from '../services/api'

const settings = ref({
  connectionsPath: '', // 连接配置保存路径
  downloadPath: '',
  tempPath: '',
  editorPath: '',
  theme: 'dark', // 新增主题设置
  terminalFontSize: 14 // 终端字体大小设置
})

const apiSettings = ref({
  baseURL: ''
})

const customHeaders = ref([])
const isAuthenticated = ref(false)
const userInfo = ref(null)

// 加载设置
const loadSettings = async () => {
  try {
    // 加载连接配置路径
    if (window.connectionAPI) {
      const connectionsPathResult = await window.connectionAPI.getConnectionsPath()
      if (connectionsPathResult.success) {
        // 提取目录路径（去掉文件名）
        const path = connectionsPathResult.path
        const dirPath = path.substring(0, path.lastIndexOf('/'))
        settings.value.connectionsPath = dirPath
      }
    }
    
    if (window.electronAPI && window.electronAPI.settings) {
      const result = await window.electronAPI.settings.getDownloadPath()
      if (result.success) {
        settings.value.downloadPath = result.path
      }
      const tempResult = await window.electronAPI.settings.getTempPath()
      if (tempResult.success) {
        settings.value.tempPath = tempResult.path
      }
      const editorResult = await window.electronAPI.settings.getEditorPath()
      if (editorResult.success) {
        settings.value.editorPath = editorResult.path
      }
      const themeResult = await window.electronAPI.settings.getTheme()
      if (themeResult.success) {
        settings.value.theme = themeResult.theme
      }
      const fontSizeResult = await window.electronAPI.settings.getTerminalFontSize()
      if (fontSizeResult.success) {
        settings.value.terminalFontSize = fontSizeResult.fontSize
      }
    }
  } catch (error) {
    console.error('加载设置失败:', error)
  }
}

// 选择连接配置保存路径
const selectConnectionsPath = async () => {
  try {
    if (window.connectionAPI) {
      const result = await window.connectionAPI.selectPath()
      if (result.success && result.path) {
        settings.value.connectionsPath = result.path
        ElMessage.success('连接配置保存位置已更新')
        // 重新加载设置以确保路径正确
        await loadSettings()
      }
    }
  } catch (error) {
    ElMessage.error('选择位置失败: ' + error.message)
  }
}

// 打开连接配置文件夹
const openConnectionsFolder = async () => {
  try {
    if (!settings.value.connectionsPath) {
      ElMessage.warning('连接配置保存位置未设置')
      return
    }
    
    if (window.electronAPI && window.electronAPI.system && window.electronAPI.system.openFolder) {
      const result = await window.electronAPI.system.openFolder(settings.value.connectionsPath)
      if (!result.success) {
        ElMessage.error('打开文件夹失败: ' + result.message)
      }
    } else {
      ElMessage.error('系统 API 不可用')
    }
  } catch (error) {
    console.error('打开文件夹失败:', error)
    ElMessage.error('打开文件夹失败: ' + error.message)
  }
}

// 选择下载位置
const selectDownloadPath = async () => {
  try {
    if (window.electronAPI && window.electronAPI.settings) {
      const result = await window.electronAPI.settings.selectDownloadPath()
      if (result.success && result.directoryPath) {
        const saveResult = await window.electronAPI.settings.setDownloadPath(result.directoryPath)
        if (saveResult.success) {
          settings.value.downloadPath = result.directoryPath
          ElMessage.success('下载位置已更新')
        } else {
          ElMessage.error('保存设置失败: ' + saveResult.message)
        }
      }
    }
  } catch (error) {
    ElMessage.error('选择位置失败: ' + error.message)
  }
}

// 选择临时文件目录
const selectTempPath = async () => {
  try {
    if (window.electronAPI && window.electronAPI.settings) {
      const result = await window.electronAPI.settings.selectTempPath()
      if (result.success && result.directoryPath) {
        const saveResult = await window.electronAPI.settings.setTempPath(result.directoryPath)
        if (saveResult.success) {
          settings.value.tempPath = result.directoryPath
          ElMessage.success('临时文件目录已更新')
        } else {
          ElMessage.error('保存设置失败: ' + saveResult.message)
        }
      }
    }
  } catch (error) {
    ElMessage.error('选择临时文件目录失败: ' + error.message)
  }
}

// 选择默认编辑器
const selectEditor = async () => {
  try {
    if (window.electronAPI && window.electronAPI.settings) {
      const result = await window.electronAPI.settings.selectEditor()
      if (result.success && result.editorPath) {
        const saveResult = await window.electronAPI.settings.setEditorPath(result.editorPath)
        if (saveResult.success) {
          settings.value.editorPath = result.editorPath
          ElMessage.success('默认编辑器已更新')
        } else {
          ElMessage.error('保存设置失败: ' + saveResult.message)
        }
      }
    }
  } catch (error) {
    ElMessage.error('选择编辑器失败: ' + error.message)
  }
}

// 打开下载文件夹
const openDownloadFolder = async () => {
  try {
    if (!settings.value.downloadPath) {
      ElMessage.warning('下载位置未设置')
      return
    }
    
    if (window.electronAPI && window.electronAPI.system && window.electronAPI.system.openFolder) {
      const result = await window.electronAPI.system.openFolder(settings.value.downloadPath)
      if (!result.success) {
        ElMessage.error('打开文件夹失败: ' + result.message)
      }
    } else {
      ElMessage.error('系统 API 不可用')
    }
  } catch (error) {
    console.error('打开文件夹失败:', error)
    ElMessage.error('打开文件夹失败: ' + error.message)
  }
}

// 打开临时文件夹
const openTempFolder = async () => {
  try {
    if (!settings.value.tempPath) {
      ElMessage.warning('临时文件目录未设置')
      return
    }
    
    if (window.electronAPI && window.electronAPI.system && window.electronAPI.system.openFolder) {
      const result = await window.electronAPI.system.openFolder(settings.value.tempPath)
      if (!result.success) {
        ElMessage.error('打开文件夹失败: ' + result.message)
      }
    } else {
      ElMessage.error('系统 API 不可用')
    }
  } catch (error) {
    console.error('打开文件夹失败:', error)
    ElMessage.error('打开文件夹失败: ' + error.message)
  }
}

// 处理主题变化
const handleThemeChange = async (value) => {
  try {
    if (window.electronAPI && window.electronAPI.settings) {
      const saveResult = await window.electronAPI.settings.setTheme(value)
      if (saveResult.success) {
        // 立即应用主题
        if (window.__app && window.__app.applyTheme) {
          window.__app.applyTheme(value)
        }
        // 关闭之前的消息，避免堆叠
        ElMessage.closeAll()
        ElMessage.success({
          message: '主题已更新',
          duration: 1500
        })
      } else {
        ElMessage.closeAll()
        ElMessage.error({
          message: '保存设置失败: ' + saveResult.message,
          duration: 2000
        })
      }
    }
  } catch (error) {
    ElMessage.closeAll()
    ElMessage.error({
      message: '保存主题失败: ' + error.message,
      duration: 2000
    })
  }
}

// 字体大小变化的防抖定时器
let fontSizeChangeTimer = null

// 处理终端字体大小变化
const handleFontSizeChange = async (value) => {
  // 清除之前的定时器
  if (fontSizeChangeTimer) {
    clearTimeout(fontSizeChangeTimer)
  }
  
  // 设置新的定时器，延迟保存和提示
  fontSizeChangeTimer = setTimeout(async () => {
    try {
      if (window.electronAPI && window.electronAPI.settings) {
        const saveResult = await window.electronAPI.settings.setTerminalFontSize(value)
        if (saveResult.success) {
          // 使用单例模式，关闭之前的消息
          ElMessage.closeAll()
          ElMessage.success({
            message: '终端字体大小已更新',
            duration: 1500,
            showClose: false
          })
        } else {
          ElMessage.closeAll()
          ElMessage.error({
            message: '保存设置失败: ' + saveResult.message,
            duration: 2000
          })
        }
      }
    } catch (error) {
      ElMessage.closeAll()
      ElMessage.error({
        message: '保存字体大小失败: ' + error.message,
        duration: 2000
      })
    }
  }, 500) // 500ms 防抖延迟
}

// 添加请求头
const addHeader = () => {
  customHeaders.value.push({ key: '', value: '' })
}

// 移除请求头
const removeHeader = (index) => {
  customHeaders.value.splice(index, 1)
}

// 保存 API 配置
const saveApiConfig = () => {
  if (!apiSettings.value.baseURL) {
    ElMessage.warning('请输入 API 地址')
    return
  }

  // 保存基础地址
  apiConfig.saveBaseURL(apiSettings.value.baseURL)
  
  // 保存自定义请求头
  const headersObj = {}
  customHeaders.value.forEach(header => {
    if (header.key && header.value) {
      headersObj[header.key] = header.value
    }
  })
  apiConfig.saveCustomHeaders(headersObj)
  
  ElMessage.success('API 配置已保存')
}

// 显示登录界面
const showLogin = () => {
  // 清除跳过登录的标记
  localStorage.removeItem('skip_login')
  // 刷新页面，显示登录界面
  window.location.reload()
}

// 处理退出登录
const handleLogout = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要退出登录吗？退出后将使用本地存储模式。',
      '退出登录',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    authAPI.logout()
    isAuthenticated.value = false
    userInfo.value = null
    ElMessage.success('已退出登录')
  } catch {
    // 用户取消
  }
}

// 加载账户信息
const loadAccountInfo = () => {
  isAuthenticated.value = authAPI.isAuthenticated()
  if (isAuthenticated.value) {
    userInfo.value = authAPI.getUserInfo()
  }
  apiSettings.value.baseURL = apiConfig.baseURL
  
  // 加载自定义请求头
  const headers = apiConfig.customHeaders || {}
  customHeaders.value = Object.entries(headers).map(([key, value]) => ({
    key,
    value
  }))
}

onMounted(async () => {
  await loadSettings()
  loadAccountInfo()
  
  // 应用保存的主题
  if (window.__app && window.__app.applyTheme) {
    window.__app.applyTheme(settings.value.theme)
  }

  // 监听登出事件
  window.addEventListener('auth:logout', () => {
    isAuthenticated.value = false
    userInfo.value = null
  })
})
</script>

<style scoped>
.settings-tab {
  padding: 20px;
  background: var(--bg-primary);
  min-height: 100%;
  overflow-y: auto;
  transition: background-color 0.3s ease;
}

.settings-card {
  margin-bottom: 20px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.settings-card :deep(.el-card__header) {
  border-bottom: 1px solid var(--border-color);
  padding: 15px 20px;
  background: var(--bg-secondary);
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.settings-card :deep(.el-card__body) {
  padding: 20px;
}

.card-header {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  transition: color 0.3s ease;
}

.path-input-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

.path-input {
  flex: 1;
}

.path-input :deep(.el-input__wrapper) {
  background-color: var(--input-bg);
  border-color: var(--border-color);
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.path-input :deep(.el-input__inner) {
  color: var(--text-primary);
  transition: color 0.3s ease;
}

.settings-tab :deep(.el-form-item__label) {
  color: var(--text-primary);
  transition: color 0.3s ease;
}

.settings-tab :deep(.el-text) {
  color: var(--text-secondary);
  transition: color 0.3s ease;
}

.settings-tab :deep(.el-descriptions__label) {
  color: var(--text-secondary);
  transition: color 0.3s ease;
}

.settings-tab :deep(.el-descriptions__content) {
  color: var(--text-primary);
  transition: color 0.3s ease;
}

.settings-tab :deep(.el-divider) {
  border-color: var(--border-color);
  transition: border-color 0.3s ease;
}

.settings-tab :deep(.el-radio__label) {
  color: var(--text-primary);
  transition: color 0.3s ease;
}

.settings-tab :deep(.el-radio__input.is-checked + .el-radio__label) {
  color: var(--accent-color);
}

.settings-tab :deep(.el-radio__inner) {
  border-color: var(--border-color);
  background: var(--input-bg);
  transition: all 0.3s ease;
}

.settings-tab :deep(.el-radio__input.is-checked .el-radio__inner) {
  border-color: var(--accent-color);
  background: var(--accent-color);
}

.font-size-control {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.font-size-control :deep(.el-slider) {
  flex: 1;
  min-width: 300px;
}

.font-size-control :deep(.el-slider__input) {
  width: 120px;
}

.headers-config {
  width: 100%;
}

.header-item-row {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}
</style>
