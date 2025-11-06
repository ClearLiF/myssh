<template>
  <el-dialog
    v-model="dialogVisible"
    title="导入FinalShell连接"
    width="600px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <div class="import-dialog">
      <!-- 步骤指示器 -->
      <el-steps :active="currentStep" finish-status="success" align-center>
        <el-step title="选择文件" />
        <el-step title="预览连接" />
        <el-step title="导入完成" />
      </el-steps>

      <!-- 步骤1: 文件选择 -->
      <div v-if="currentStep === 0" class="step-content">
        <div class="file-upload-area">
          <div class="upload-options">
            <el-radio-group v-model="uploadType" @change="handleUploadTypeChange">
              <el-radio label="file">选择JSON文件</el-radio>
              <el-radio label="folder">选择文件夹</el-radio>
            </el-radio-group>
          </div>

          <el-upload
            v-if="uploadType === 'file'"
            ref="uploadRef"
            :auto-upload="false"
            :show-file-list="false"
            accept=".json"
            :on-change="handleFileChange"
            drag
          >
            <el-icon class="el-icon--upload"><upload-filled /></el-icon>
            <div class="el-upload__text">
              将FinalShell导出的JSON文件拖到此处，或<em>点击上传</em>
            </div>
            <template #tip>
              <div class="el-upload__tip">
                支持单个JSON配置文件
              </div>
            </template>
          </el-upload>

          <div v-else class="folder-upload">
            <el-button
              type="primary"
              size="large"
              @click="selectFolder"
              :loading="selectingFolder"
            >
              <el-icon><FolderOpened /></el-icon>
              选择FinalShell导出文件夹
            </el-button>
            <div class="folder-tip">
              选择包含多个 *_connect_config.json 文件的文件夹
            </div>
          </div>
        </div>

        <div v-if="selectedFile || selectedFolder" class="file-info">
          <el-alert
            v-if="uploadType === 'file' && selectedFile"
            :title="`已选择文件: ${selectedFile.name}`"
            type="success"
            :closable="false"
            show-icon
          />
          <el-alert
            v-if="uploadType === 'folder' && selectedFolder"
            :title="`已选择文件夹: ${selectedFolder.name} (包含 ${selectedFolder.fileCount} 个配置文件)`"
            type="success"
            :closable="false"
            show-icon
          >
            <template #default>
              <div>路径: {{ selectedFolder.path }}</div>
              <div v-if="selectedFolder.files && selectedFolder.files.length > 0">
                前几个文件: {{ selectedFolder.files.slice(0, 3).map(f => f.name).join(', ') }}
                <span v-if="selectedFolder.files.length > 3">...</span>
              </div>
            </template>
          </el-alert>
        </div>


        <div class="password-input">
          <el-form :model="importForm" label-width="120px">
            <el-form-item label="统一密码">
              <el-input
                v-model="importForm.password"
                type="password"
                placeholder="如果所有连接使用相同密码，请输入"
                show-password
              />
              <div class="form-tip">
                如果不填写，将保留FinalShell的加密密码（需要手动重新输入）
              </div>
            </el-form-item>
          </el-form>
        </div>
      </div>

      <!-- 步骤2: 预览连接 -->
      <div v-if="currentStep === 1" class="step-content">
        <div class="preview-header">
          <el-alert
            :title="`找到 ${parsedConnections.length} 个连接配置`"
            type="info"
            :closable="false"
            show-icon
          />
        </div>

        <div class="group-stats">
          <h4>分组统计：</h4>
          <el-tag
            v-for="(count, group) in groupStats"
            :key="group"
            class="group-tag"
            type="primary"
          >
            {{ group }}: {{ count }}个
          </el-tag>
        </div>

        <div class="connections-preview">
          <h4>连接预览 (共 {{ parsedConnections.length }} 个，显示前 {{ Math.min(20, parsedConnections.length) }} 个)</h4>
          <el-table
            :data="previewData"
            height="300"
            style="width: 100%"
          >
            <el-table-column prop="name" label="连接名称" width="200" />
            <el-table-column prop="host" label="主机地址" width="150" />
            <el-table-column prop="username" label="用户名" width="100" />
            <el-table-column prop="group" label="分组" />
          </el-table>
        </div>

        <div class="import-options">
          <el-checkbox v-model="importForm.skipDuplicates">
            跳过重复连接（基于主机地址+端口+用户名判断）
          </el-checkbox>
        </div>
      </div>

      <!-- 步骤3: 导入结果 -->
      <div v-if="currentStep === 2" class="step-content">
        <div class="import-result">
          <el-result
            icon="success"
            title="导入成功"
            :sub-title="`成功导入 ${importResult.added} 个新连接，跳过 ${importResult.skipped} 个重复连接`"
          >
            <template #extra>
              <div class="result-stats">
                <p><strong>总连接数:</strong> {{ importResult.total }}</p>
                <p><strong>新增连接:</strong> {{ importResult.added }}</p>
                <p><strong>跳过重复:</strong> {{ importResult.skipped }}</p>
              </div>
            </template>
          </el-result>
        </div>
      </div>
    </div>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button
          v-if="currentStep === 0"
          type="primary"
          :disabled="!selectedFile && !selectedFolder"
          :loading="parsing"
          @click="parseFiles"
        >
          {{ uploadType === 'file' ? '解析文件' : '解析文件夹' }}
        </el-button>
        <el-button
          v-if="currentStep === 1"
          @click="currentStep = 0"
        >
          上一步
        </el-button>
        <el-button
          v-if="currentStep === 1"
          type="primary"
          :loading="importing"
          @click="importConnections"
        >
          {{ importing ? `导入中... (${importProgress}%)` : '开始导入' }}
        </el-button>
        <el-button
          v-if="currentStep === 2"
          type="primary"
          @click="handleClose"
        >
          完成
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, FolderOpened } from '@element-plus/icons-vue'
import { sshListAPI } from '../services/api'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:visible', 'import-success'])

const dialogVisible = ref(false)
const currentStep = ref(0)
const uploadType = ref('folder') // 默认选择文件夹模式
const selectedFile = ref(null)
const selectedFolder = ref(null)
const selectingFolder = ref(false)
const parsing = ref(false)
const importing = ref(false)
const importProgress = ref(0)
const parsedConnections = ref([])
const importResult = ref({})

const importForm = ref({
  password: 'Xiao123...',
  skipDuplicates: true
})

// 监听props变化
watch(() => props.visible, (val) => {
  dialogVisible.value = val
})

// 监听dialog变化
watch(dialogVisible, (val) => {
  emit('update:visible', val)
})

// 分组统计
const groupStats = computed(() => {
  const stats = {}
  parsedConnections.value.forEach(conn => {
    const group = conn.group || '根目录'
    stats[group] = (stats[group] || 0) + 1
  })
  return stats
})

// 预览数据（限制显示数量）
const previewData = computed(() => {
  return parsedConnections.value.slice(0, 20) // 只显示前20个，提高性能
})

// 处理上传类型变化
const handleUploadTypeChange = () => {
  selectedFile.value = null
  selectedFolder.value = null
}

// 处理文件选择
const handleFileChange = (file) => {
  selectedFile.value = file
  selectedFolder.value = null
}

// 选择文件夹
const selectFolder = async () => {
  if (!window.electronAPI || !window.electronAPI.dialog) {
    ElMessage.error('文件系统API不可用，请确保在Electron环境中运行')
    return
  }

  selectingFolder.value = true
  try {
    const result = await window.electronAPI.dialog.openDirectory()
    
    if (result.success && result.directoryPath) {
      const folderPath = result.directoryPath
      
      // 扫描文件夹中的配置文件
      const files = await scanFolderForConfigs(folderPath)
      
      selectedFolder.value = {
        path: folderPath,
        name: folderPath.split('/').pop(),
        files: files.slice(0, 5), // 只保存前5个文件用于显示
        fileCount: files.length,
        allFiles: files // 完整文件列表，但不用于响应式显示
      }
      selectedFile.value = null
      
      if (files.length === 0) {
        ElMessage.warning('选择的文件夹中没有找到FinalShell配置文件')
      } else {
        ElMessage.success(`找到 ${files.length} 个配置文件`)
      }
    }
  } catch (error) {
    console.error('选择文件夹失败:', error)
    ElMessage.error('选择文件夹失败: ' + error.message)
  } finally {
    selectingFolder.value = false
  }
}

// 扫描文件夹中的配置文件
const scanFolderForConfigs = async (folderPath) => {
  try {
    const scanResult = await window.electronAPI.fs.scanDirectory(folderPath, '_connect_config.json')
    
    if (scanResult.success) {
      return scanResult.files || []
    } else {
      ElMessage.error('扫描文件夹失败: ' + scanResult.message)
      return []
    }
  } catch (error) {
    console.error('扫描文件夹异常:', error)
    ElMessage.error('扫描文件夹异常: ' + error.message)
    return []
  }
}

// 解析FinalShell配置
const parseFinalShellConfig = (config, groupName = '') => {
  return {
    name: config.name || config.host,
    host: config.host,
    port: config.port || 22,
    username: config.user_name || 'root',
    authType: config.authentication_type === 2 || config.secret_key_id ? 'privateKey' : 'password',
    password: importForm.value.password || '', // 使用统一密码或留空
    privateKeyContent: '',
    privateKeyPassphrase: '',
    group: groupName
  }
}

// 解析文件或文件夹
const parseFiles = async () => {
  if (!selectedFile.value && !selectedFolder.value) return

  parsing.value = true
  try {
    let configs = []

    if (uploadType.value === 'file' && selectedFile.value) {
      // 单文件模式
      const fileContent = await readFileContent(selectedFile.value.raw)
      configs = await parseJsonContent(fileContent)
    } else if (uploadType.value === 'folder' && selectedFolder.value) {
      // 文件夹模式
      configs = await parseFolderConfigs(selectedFolder.value)
    }

    parsedConnections.value = configs
    currentStep.value = 1
    
  } catch (error) {
    console.error('解析失败:', error)
    ElMessage.error('解析失败: ' + error.message)
  } finally {
    parsing.value = false
  }
}

// 解析JSON内容
const parseJsonContent = async (content, groupName = '') => {
  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed)) {
      return parsed.map(config => parseFinalShellConfig(config, groupName))
    } else {
      return [parseFinalShellConfig(parsed, groupName)]
    }
  } catch (jsonError) {
    throw new Error('文件格式不正确，请确保是有效的JSON格式')
  }
}

// 解析文件夹中的配置
const parseFolderConfigs = async (folder) => {
  const allConfigs = []
  const filesToProcess = folder.allFiles || folder.files
  
  for (const fileInfo of filesToProcess) {
    try {
      // 读取文件内容
      const result = await window.electronAPI.fs.readFile(fileInfo.path)
      if (result.success) {
        // 确定分组名称（基于文件路径）
        const groupName = fileInfo.group || ''
        const configs = await parseJsonContent(result.data, groupName)
        allConfigs.push(...configs)
      }
    } catch (error) {
      console.warn(`跳过文件 ${fileInfo.path}:`, error.message)
    }
  }
  
  return allConfigs
}

// 读取文件内容
const readFileContent = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsText(file)
  })
}

// 导入连接
const importConnections = async () => {
  importing.value = true
  try {
    // 获取现有连接
    let existingConnections = []
    try {
      const result = await sshListAPI.getList()
      if (result.success) {
        existingConnections = result.data || []
      }
    } catch (error) {
      console.warn('获取现有连接失败，将作为新连接处理:', error)
    }

    // 过滤重复连接
    const newConnections = []
    let skippedCount = 0

    parsedConnections.value.forEach(newConn => {
      if (importForm.value.skipDuplicates) {
        const exists = existingConnections.some(existing => 
          existing.host === newConn.host && 
          existing.port === newConn.port && 
          existing.username === newConn.username
        )
        
        if (exists) {
          skippedCount++
          return
        }
      }
      
      newConnections.push(newConn)
    })

  // 批量保存新连接，带进度更新
  let addedCount = 0
  const totalConnections = newConnections.length
  
  for (let i = 0; i < newConnections.length; i++) {
    const connection = newConnections[i]
    try {
      const result = await sshListAPI.add(connection)
      if (result.success) {
        addedCount++
      }
      
      // 更新进度
      importProgress.value = Math.round(((i + 1) / totalConnections) * 100)
      
      // 每处理10个连接后稍微延迟，避免界面卡顿
      if ((i + 1) % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    } catch (error) {
      console.error('保存连接失败:', connection.name, error)
    }
  }

    // 设置导入结果
    importResult.value = {
      total: existingConnections.length + addedCount,
      added: addedCount,
      skipped: skippedCount
    }

    currentStep.value = 2
    emit('import-success', importResult.value)
    
  } catch (error) {
    console.error('导入连接失败:', error)
    ElMessage.error('导入连接失败: ' + error.message)
  } finally {
    importing.value = false
  }
}

// 关闭对话框
const handleClose = () => {
  dialogVisible.value = false
  // 重置状态
  setTimeout(() => {
    currentStep.value = 0
    uploadType.value = 'folder'
    selectedFile.value = null
    selectedFolder.value = null
    parsedConnections.value = []
    importResult.value = {}
    importProgress.value = 0
    importForm.value = {
      password: 'Xiao123...',
      skipDuplicates: true
    }
  }, 300)
}
</script>

<style scoped>
.import-dialog {
  padding: 20px 0;
}

.step-content {
  margin: 30px 0;
  min-height: 300px;
}

.file-upload-area {
  margin: 20px 0;
}

.upload-options {
  margin-bottom: 16px;
  text-align: center;
}

.folder-upload {
  text-align: center;
  padding: 40px 20px;
  border: 2px dashed #dcdfe6;
  border-radius: 6px;
  background-color: #fafafa;
  transition: border-color 0.3s;
}

.folder-upload:hover {
  border-color: #409eff;
}

.folder-tip {
  margin-top: 12px;
  color: #909399;
  font-size: 14px;
}

.file-info {
  margin: 15px 0;
}

.password-input {
  margin: 20px 0;
}

.form-tip {
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin-top: 5px;
}

.preview-header {
  margin-bottom: 15px;
}

.group-stats {
  margin: 15px 0;
}

.group-tag {
  margin: 5px 5px 5px 0;
}

.connections-preview {
  margin: 20px 0;
}

.import-options {
  margin: 15px 0;
}

.import-result {
  text-align: center;
}

.result-stats {
  text-align: left;
  background: var(--el-fill-color-light);
  padding: 15px;
  border-radius: 6px;
  margin-top: 15px;
}

.result-stats p {
  margin: 5px 0;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
