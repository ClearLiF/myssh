<template>
  <div class="script-manager">
    <el-card class="script-card">
      <template #header>
        <div class="card-header">
          <span>脚本管理</span>
          <div class="header-actions">
            <el-button type="primary" @click="createScript">
              <el-icon><Plus /></el-icon>
              新建脚本
            </el-button>
            <el-button type="info" @click="refreshFromCloud" :loading="isRefreshing">
              <el-icon><Refresh /></el-icon>
              刷新脚本
            </el-button>
            <el-button type="success" @click="saveToCloud" :loading="isSaving">
              <el-icon><Upload /></el-icon>
              保存到云端
            </el-button>
          </div>
        </div>
      </template>
      
      <div class="script-container">
        <!-- 脚本列表 -->
        <div class="script-list">
          <el-empty v-if="scripts.length === 0" description="暂无脚本，点击上方按钮创建" />
          <div v-else>
            <div class="list-header">
              <span>拖动脚本可调整顺序</span>
            </div>
            <draggable 
              v-model="scripts" 
              item-key="id"
              handle=".drag-handle"
              animation="200"
              @end="onDragEnd"
            >
              <template #item="{element, index}">
                <div class="script-item">
                  <div class="drag-handle">
                    <el-icon><Rank /></el-icon>
                  </div>
                  <div class="script-info">
                    <div class="script-header">
                      <span class="script-name">{{ element.name }}</span>
                      <el-tag :type="getScriptTypeTag(element.type)" size="small">
                        {{ element.type }}
                      </el-tag>
                    </div>
                    <div class="script-description">{{ element.description || '暂无描述' }}</div>
                    <div class="script-params" v-if="element.params && element.params.length > 0">
                      <el-tag v-for="param in element.params" :key="param.name" size="small" type="info">
                        {{ param.name }}
                      </el-tag>
                    </div>
                  </div>
                  <div class="script-actions">
                    <el-button size="small" @click="editScript(element)">
                      编辑
                    </el-button>
                    <el-button 
                      size="small" 
                      type="success" 
                      @click="runScript(element)"
                    >
                      运行
                    </el-button>
                    <el-button 
                      size="small" 
                      type="danger" 
                      @click="deleteScript(element, index)"
                    >
                      删除
                    </el-button>
                  </div>
                </div>
              </template>
            </draggable>
          </div>
        </div>
        
        <!-- 脚本编辑器对话框 -->
        <el-dialog
          v-model="showEditor"
          :title="isEditing ? '编辑脚本' : '新建脚本'"
          width="800px"
          :close-on-click-modal="false"
        >
          <el-form :model="currentScript" label-width="100px">
            <el-form-item label="脚本名称" required>
              <el-input v-model="currentScript.name" placeholder="输入脚本名称" />
            </el-form-item>
            
            <el-form-item label="脚本描述">
              <el-input 
                v-model="currentScript.description" 
                type="textarea" 
                :rows="2"
                placeholder="输入脚本描述"
              />
            </el-form-item>
            
            <el-form-item label="脚本类型">
              <el-select v-model="currentScript.type" placeholder="选择脚本类型">
                <el-option label="Shell" value="shell" />
                <el-option label="Python" value="python" />
                <el-option label="JavaScript" value="javascript" />
                <el-option label="命令" value="command" />
                <el-option label="其他" value="other" />
              </el-select>
            </el-form-item>

            <!-- 参数管理 -->
            <el-form-item label="脚本参数">
              <div class="params-manager">
                <div class="params-list">
                  <div v-for="(param, index) in currentScript.params" :key="index" class="param-item">
                    <el-input 
                      v-model="param.name" 
                      placeholder="参数名称"
                      style="width: 150px; margin-right: 8px;"
                    />
                    <el-input 
                      v-model="param.defaultValue" 
                      placeholder="默认值（可选）"
                      style="width: 200px; margin-right: 8px;"
                    />
                    <el-input 
                      v-model="param.description" 
                      placeholder="参数描述（可选）"
                      style="flex: 1; margin-right: 8px;"
                    />
                    <el-button 
                      size="small" 
                      type="danger" 
                      @click="removeParam(index)"
                      :icon="Delete"
                    />
                  </div>
                </div>
                <el-button 
                  size="small" 
                  type="primary" 
                  @click="addParam"
                  :icon="Plus"
                >
                  添加参数
                </el-button>
                <div class="params-tip">
                  <el-alert 
                    title="在脚本内容中使用 ${参数名称} 来引用参数，例如: echo ${username}" 
                    type="info" 
                    :closable="false"
                    show-icon
                  />
                </div>
              </div>
            </el-form-item>
            
            <el-form-item label="脚本内容" required>
              <el-input
                v-model="currentScript.content"
                type="textarea"
                :rows="15"
                placeholder="输入脚本内容，使用 ${参数名} 引用参数"
                class="script-content"
              />
            </el-form-item>
          </el-form>

          <template #footer>
            <el-button @click="cancelEdit">取消</el-button>
            <el-button type="primary" @click="saveScript">保存</el-button>
          </template>
        </el-dialog>
      </div>
    </el-card>

    <!-- 运行脚本对话框 -->
    <el-dialog
      v-model="showRunDialog"
      title="运行脚本"
      width="600px"
      :close-on-click-modal="false"
    >
      <div v-if="runningScript">
        <el-form label-width="120px">
          <el-form-item label="脚本名称">
            <span>{{ runningScript.name }}</span>
          </el-form-item>
          
          <div v-if="runningScript.params && runningScript.params.length > 0">
            <el-divider content-position="left">参数配置</el-divider>
            <el-form-item 
              v-for="param in runningScript.params" 
              :key="param.name"
              :label="param.name"
            >
              <el-input 
                v-model="paramValues[param.name]"
                :placeholder="param.description || `请输入${param.name}`"
              />
              <div class="param-default" v-if="param.defaultValue">
                默认值: {{ param.defaultValue }}
              </div>
            </el-form-item>
          </div>
        </el-form>
        
        <div class="script-preview">
          <el-divider content-position="left">脚本预览</el-divider>
          <el-input
            :model-value="getProcessedScript()"
            type="textarea"
            :rows="10"
            readonly
            class="script-content"
          />
        </div>
      </div>

      <template #footer>
        <el-button @click="showRunDialog = false">取消</el-button>
        <el-button type="primary" @click="executeScript">执行</el-button>
      </template>
    </el-dialog>

    <!-- 运行结果对话框 -->
    <el-dialog
      v-model="showRunResult"
      title="脚本运行结果"
      width="800px"
      :close-on-click-modal="false"
    >
      <div class="run-result">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="脚本名称">
            {{ executedScript?.name }}
          </el-descriptions-item>
          <el-descriptions-item label="运行状态">
            <el-tag :type="runResult.success ? 'success' : 'danger'">
              {{ runResult.success ? '成功' : '失败' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="执行时间">
            {{ runResult.duration }}ms
          </el-descriptions-item>
          <el-descriptions-item label="退出码">
            {{ runResult.exitCode }}
          </el-descriptions-item>
        </el-descriptions>
        
        <div class="output-section">
          <h4>标准输出</h4>
          <el-input
            v-model="runResult.stdout"
            type="textarea"
            :rows="6"
            readonly
            class="output-text"
          />
        </div>
        
        <div class="output-section" v-if="runResult.stderr">
          <h4>错误输出</h4>
          <el-input
            v-model="runResult.stderr"
            type="textarea"
            :rows="4"
            readonly
            class="output-text error"
          />
        </div>
      </div>
      
      <template #footer>
        <el-button @click="showRunResult = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Upload, Refresh, Rank, Delete } from '@element-plus/icons-vue'
import draggable from 'vuedraggable'
import { authAPI } from '../services/api'

// 脚本数据
const scripts = ref([])
const isSaving = ref(false)
const isRefreshing = ref(false)

// 编辑器状态
const showEditor = ref(false)
const isEditing = ref(false)
const currentScript = ref({
  name: '',
  description: '',
  type: 'shell',
  content: '',
  params: []
})

// 运行相关
const showRunDialog = ref(false)
const showRunResult = ref(false)
const runningScript = ref(null)
const executedScript = ref(null)
const paramValues = ref({})
const runResult = ref({
  success: false,
  duration: 0,
  exitCode: 0,
  stdout: '',
  stderr: ''
})

// 加载脚本数据
const loadScripts = () => {
  try {
    if (!authAPI.isAuthenticated()) {
      // 未登录时从本地存储加载
      const localScripts = localStorage.getItem('local_scripts')
      if (localScripts) {
        scripts.value = JSON.parse(localScripts)
      }
      return
    }

    // 已登录从用户 otherInfo 加载
    const otherInfo = authAPI.getUserOtherInfo()
    if (otherInfo.script && Array.isArray(otherInfo.script)) {
      scripts.value = otherInfo.script
      console.log('✅ 从云端加载脚本:', scripts.value.length, '个')
    } else {
      scripts.value = []
    }
  } catch (error) {
    console.error('加载脚本失败:', error)
    ElMessage.error('加载脚本失败')
  }
}

// 从云端刷新脚本数据
const refreshFromCloud = async () => {
  if (!authAPI.isAuthenticated()) {
    ElMessage.warning('请先登录后再刷新')
    return
  }

  try {
    isRefreshing.value = true
    
    // 重新获取用户信息和脚本数据
    const result = await authAPI.refreshUserInfo()
    
    if (result.success) {
      // 重新加载脚本
      loadScripts()
      ElMessage.success('脚本刷新成功')
      // 触发更新事件，通知其他组件刷新脚本列表
      window.dispatchEvent(new CustomEvent('scripts-updated'))
    } else {
      ElMessage.error(result.error || '刷新失败')
    }
  } catch (error) {
    console.error('刷新脚本失败:', error)
    ElMessage.error('刷新脚本失败')
  } finally {
    isRefreshing.value = false
  }
}

// 保存脚本数据到云端
const saveToCloud = async () => {
  if (!authAPI.isAuthenticated()) {
    ElMessage.warning('请先登录后再保存到云端')
    return
  }

  try {
    isSaving.value = true
    
    // 获取当前的 otherInfo
    const otherInfo = authAPI.getUserOtherInfo()
    
    // 更新脚本数据
    otherInfo.script = scripts.value
    
    // 保存到云端
    const result = await authAPI.updateUserOtherInfo(otherInfo)
    
    if (result.success) {
      ElMessage.success('保存到云端成功')
      // 触发更新事件，通知其他组件刷新脚本列表
      window.dispatchEvent(new CustomEvent('scripts-updated'))
    } else {
      ElMessage.error(result.error || '保存失败')
    }
  } catch (error) {
    console.error('保存到云端失败:', error)
    ElMessage.error('保存到云端失败')
  } finally {
    isSaving.value = false
  }
}

// 保存到本地存储（未登录时使用）
const saveToLocal = () => {
  try {
    localStorage.setItem('local_scripts', JSON.stringify(scripts.value))
    // 触发更新事件，通知其他组件刷新脚本列表
    window.dispatchEvent(new CustomEvent('scripts-updated'))
  } catch (error) {
    console.error('保存到本地失败:', error)
  }
}

// 获取脚本类型标签样式
const getScriptTypeTag = (type) => {
  const typeMap = {
    shell: 'primary',
    python: 'success',
    javascript: 'warning',
    command: '',
    other: 'info'
  }
  return typeMap[type] || 'info'
}

// 新建脚本
const createScript = () => {
  isEditing.value = false
  currentScript.value = {
    name: '',
    description: '',
    type: 'shell',
    content: '',
    params: []
  }
  showEditor.value = true
}

// 编辑脚本
const editScript = (script) => {
  isEditing.value = true
  currentScript.value = JSON.parse(JSON.stringify(script)) // 深拷贝
  showEditor.value = true
}

// 添加参数
const addParam = () => {
  currentScript.value.params.push({
    name: '',
    defaultValue: '',
    description: ''
  })
}

// 删除参数
const removeParam = (index) => {
  currentScript.value.params.splice(index, 1)
}

// 保存脚本
const saveScript = () => {
  if (!currentScript.value.name.trim()) {
    ElMessage.warning('请输入脚本名称')
    return
  }
  
  if (!currentScript.value.content.trim()) {
    ElMessage.warning('请输入脚本内容')
    return
  }

  // 验证参数名称不能为空
  for (let param of currentScript.value.params) {
    if (!param.name.trim()) {
      ElMessage.warning('参数名称不能为空')
      return
    }
  }
  
  if (isEditing.value) {
    // 更新现有脚本
    const index = scripts.value.findIndex(s => s.id === currentScript.value.id)
    if (index !== -1) {
      scripts.value[index] = { ...currentScript.value }
      ElMessage.success('脚本更新成功')
    }
  } else {
    // 创建新脚本
    const newScript = {
      ...currentScript.value,
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    }
    scripts.value.push(newScript)
    ElMessage.success('脚本创建成功')
  }
  
  showEditor.value = false
  
  // 保存到本地或云端
  if (authAPI.isAuthenticated()) {
    saveToCloud()
  } else {
    saveToLocal()
  }
}

// 取消编辑
const cancelEdit = () => {
  showEditor.value = false
  currentScript.value = {
    name: '',
    description: '',
    type: 'shell',
    content: '',
    params: []
  }
}

// 删除脚本
const deleteScript = async (script, index) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除脚本 "${script.name}" 吗？`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    scripts.value.splice(index, 1)
    ElMessage.success('脚本删除成功')
    
    // 保存更改
    if (authAPI.isAuthenticated()) {
      saveToCloud()
    } else {
      saveToLocal()
    }
  } catch {
    // 用户取消删除
  }
}

// 运行脚本
const runScript = async (script) => {
  runningScript.value = JSON.parse(JSON.stringify(script)) // 深拷贝
  
  // 初始化参数值
  paramValues.value = {}
  if (script.params && script.params.length > 0) {
    script.params.forEach(param => {
      paramValues.value[param.name] = param.defaultValue || ''
    })
  }
  
  showRunDialog.value = true
}

// 获取处理后的脚本（替换参数）
const getProcessedScript = () => {
  if (!runningScript.value) return ''
  
  let processed = runningScript.value.content
  
  // 替换参数
  for (let paramName in paramValues.value) {
    const value = paramValues.value[paramName]
    const regex = new RegExp(`\\$\\{${paramName}\\}`, 'g')
    processed = processed.replace(regex, value)
  }
  
  return processed
}

// 执行脚本
const executeScript = async () => {
  showRunDialog.value = false
  executedScript.value = runningScript.value
  
  // 模拟脚本执行
  const startTime = Date.now()
  
  try {
    // 这里应该调用 Electron 的 IPC 来执行脚本
    // 或者发送到远程服务器执行
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const duration = Date.now() - startTime
    const processedScript = getProcessedScript()
    
    runResult.value = {
      success: Math.random() > 0.2, // 80% 成功率
      duration,
      exitCode: Math.random() > 0.2 ? 0 : 1,
      stdout: `脚本执行完成\n执行时间: ${duration}ms\n\n执行的脚本:\n${processedScript}`,
      stderr: Math.random() > 0.2 ? '' : '警告: 脚本执行过程中出现了一些警告信息'
    }
    
    showRunResult.value = true
    ElMessage.success('脚本执行完成')
  } catch (error) {
    runResult.value = {
      success: false,
      duration: Date.now() - startTime,
      exitCode: 1,
      stdout: '',
      stderr: `错误: ${error.message}`
    }
    showRunResult.value = true
    ElMessage.error('脚本执行失败')
  }
}

// 拖拽结束
const onDragEnd = () => {
  console.log('脚本顺序已调整')
  // 保存更改
  if (authAPI.isAuthenticated()) {
    saveToCloud()
  } else {
    saveToLocal()
  }
}

// 组件挂载时加载脚本
onMounted(() => {
  loadScripts()
})
</script>

<style scoped>
.script-manager {
  height: 100%;
  overflow: hidden;
}

.script-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.script-card :deep(.el-card__body) {
  flex: 1;
  overflow: auto;
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

.script-container {
  height: 100%;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.script-list {
  padding: 16px 0;
  flex: 1;
  overflow-y: auto;
}

.list-header {
  padding: 8px 16px;
  color: #909399;
  font-size: 13px;
  margin-bottom: 12px;
}

.script-item {
  display: flex;
  align-items: center;
  padding: 16px;
  margin-bottom: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  transition: all 0.3s;
  cursor: move;
}

.script-item:hover {
  border-color: #667eea;
  box-shadow: 0 2px 12px rgba(102, 126, 234, 0.15);
}

.drag-handle {
  margin-right: 12px;
  color: #909399;
  cursor: move;
  font-size: 18px;
  padding: 8px;
}

.drag-handle:hover {
  color: #667eea;
}

.script-info {
  flex: 1;
  min-width: 0;
}

.script-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.script-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.script-description {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 8px;
}

.script-params {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.script-actions {
  display: flex;
  gap: 8px;
  margin-left: 16px;
  flex-shrink: 0;
  align-items: center;
  z-index: 10;
}

.script-actions .el-button {
  position: relative;
  z-index: 11;
  pointer-events: auto;
}

.params-manager {
  width: 100%;
}

.params-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.param-item {
  display: flex;
  align-items: center;
}

.params-tip {
  margin-top: 12px;
}

.param-default {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}

.script-preview {
  margin-top: 20px;
}

.script-content {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 13px;
}

.run-result {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.output-section h4 {
  margin: 0 0 8px 0;
  color: #606266;
}

.output-text {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
}

.output-text.error {
  color: #f56c6c;
}
</style>
