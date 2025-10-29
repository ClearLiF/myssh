<template>
  <div class="settings-tab">
    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>应用设置</span>
        </div>
      </template>

      <!-- 下载位置设置 -->
      <el-form :model="settings" label-width="120px">
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

        <el-form-item label="默认下载">
          <el-text type="info">文件将下载到上述位置</el-text>
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
import { ElMessage } from 'element-plus'
import { Folder, Edit } from '@element-plus/icons-vue'

const settings = ref({
  downloadPath: '',
  tempPath: '',
  editorPath: '',
  theme: 'dark', // 新增主题设置
  terminalFontSize: 14 // 终端字体大小设置
})

// 加载设置
const loadSettings = async () => {
  try {
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
    if (settings.value.downloadPath) {
      const { shell } = require('electron')
      if (window.electronAPI) {
        // 在 Electron 中使用
        const exec = require('child_process').exec
        exec(`open "${settings.value.downloadPath}"`)
      }
    }
  } catch (error) {
    console.error('打开文件夹失败:', error)
  }
}

// 打开临时文件夹
const openTempFolder = async () => {
  try {
    if (settings.value.tempPath) {
      const { shell } = require('electron')
      if (window.electronAPI) {
        // 在 Electron 中使用
        const exec = require('child_process').exec
        exec(`open "${settings.value.tempPath}"`)
      }
    }
  } catch (error) {
    console.error('打开文件夹失败:', error)
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

onMounted(async () => {
  await loadSettings()
  // 应用保存的主题
  if (window.__app && window.__app.applyTheme) {
    window.__app.applyTheme(settings.value.theme)
  }
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
</style>
