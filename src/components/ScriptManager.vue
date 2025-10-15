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
            <el-button type="success" @click="importScript">
              <el-icon><Upload /></el-icon>
              导入脚本
            </el-button>
          </div>
        </div>
      </template>
      
      <div class="script-container">
        <!-- 脚本列表 -->
        <div class="script-list">
          <el-table :data="scripts" style="width: 100%">
            <el-table-column prop="name" label="脚本名称" width="200" />
            <el-table-column prop="description" label="描述" />
            <el-table-column prop="type" label="类型" width="120">
              <template #default="scope">
                <el-tag :type="getScriptTypeTag(scope.row.type)">
                  {{ scope.row.type }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="创建时间" width="180" />
            <el-table-column label="操作" width="200">
              <template #default="scope">
                <el-button size="small" @click="editScript(scope.row)">
                  编辑
                </el-button>
                <el-button 
                  size="small" 
                  type="success" 
                  @click="runScript(scope.row)"
                >
                  运行
                </el-button>
                <el-button 
                  size="small" 
                  type="danger" 
                  @click="deleteScript(scope.row)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        
        <!-- 脚本编辑器 -->
        <div class="script-editor" v-if="showEditor">
          <el-card class="editor-card">
            <template #header>
              <div class="card-header">
                <span>{{ isEditing ? '编辑脚本' : '新建脚本' }}</span>
                <div class="editor-actions">
                  <el-button @click="saveScript" type="primary">
                    保存
                  </el-button>
                  <el-button @click="cancelEdit">
                    取消
                  </el-button>
                </div>
              </div>
            </template>
            
            <el-form :model="currentScript" label-width="100px">
              <el-form-item label="脚本名称">
                <el-input v-model="currentScript.name" placeholder="输入脚本名称" />
              </el-form-item>
              
              <el-form-item label="脚本描述">
                <el-input 
                  v-model="currentScript.description" 
                  type="textarea" 
                  placeholder="输入脚本描述"
                />
              </el-form-item>
              
              <el-form-item label="脚本类型">
                <el-select v-model="currentScript.type" placeholder="选择脚本类型">
                  <el-option label="Shell" value="shell" />
                  <el-option label="Python" value="python" />
                  <el-option label="JavaScript" value="javascript" />
                  <el-option label="其他" value="other" />
                </el-select>
              </el-form-item>
              
              <el-form-item label="脚本内容">
                <el-input
                  v-model="currentScript.content"
                  type="textarea"
                  :rows="15"
                  placeholder="输入脚本内容"
                  class="script-content"
                />
              </el-form-item>
            </el-form>
          </el-card>
        </div>
      </div>
    </el-card>

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
            {{ runningScript?.name }}
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
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Upload } from '@element-plus/icons-vue'

// 脚本数据
const scripts = ref([
  {
    id: 1,
    name: '系统信息检查',
    description: '检查系统基本信息，包括CPU、内存、磁盘等',
    type: 'shell',
    content: '#!/bin/bash\necho "系统信息检查"\necho "==============="\nuname -a\nfree -h\ndf -h',
    createdAt: '2024-01-15 10:30:00'
  },
  {
    id: 2,
    name: '日志清理',
    description: '清理系统日志文件，释放磁盘空间',
    type: 'shell',
    content: '#!/bin/bash\necho "清理系统日志"\nfind /var/log -name "*.log" -mtime +30 -delete',
    createdAt: '2024-01-14 15:20:00'
  },
  {
    id: 3,
    name: '网络连接监控',
    description: '监控网络连接状态和流量',
    type: 'python',
    content: 'import psutil\nimport time\n\nwhile True:\n    connections = psutil.net_connections()\n    print(f"活跃连接数: {len(connections)}")\n    time.sleep(5)',
    createdAt: '2024-01-13 09:15:00'
  }
])

// 编辑器状态
const showEditor = ref(false)
const isEditing = ref(false)
const currentScript = ref({
  name: '',
  description: '',
  type: 'shell',
  content: ''
})

// 运行结果
const showRunResult = ref(false)
const runningScript = ref(null)
const runResult = ref({
  success: false,
  duration: 0,
  exitCode: 0,
  stdout: '',
  stderr: ''
})

// 获取脚本类型标签样式
const getScriptTypeTag = (type) => {
  const typeMap = {
    shell: 'primary',
    python: 'success',
    javascript: 'warning',
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
    content: ''
  }
  showEditor.value = true
}

// 编辑脚本
const editScript = (script) => {
  isEditing.value = true
  currentScript.value = { ...script }
  showEditor.value = true
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
      id: Date.now(),
      createdAt: new Date().toLocaleString()
    }
    scripts.value.unshift(newScript)
    ElMessage.success('脚本创建成功')
  }
  
  showEditor.value = false
}

// 取消编辑
const cancelEdit = () => {
  showEditor.value = false
  currentScript.value = {}
}

// 删除脚本
const deleteScript = async (script) => {
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
    
    const index = scripts.value.findIndex(s => s.id === script.id)
    if (index !== -1) {
      scripts.value.splice(index, 1)
      ElMessage.success('脚本删除成功')
    }
  } catch {
    // 用户取消删除
  }
}

// 运行脚本
const runScript = async (script) => {
  runningScript.value = script
  
  // 模拟脚本运行
  const startTime = Date.now()
  
  try {
    // 这里应该调用 Electron 的 IPC 来执行脚本
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const duration = Date.now() - startTime
    
    runResult.value = {
      success: Math.random() > 0.3, // 70% 成功率
      duration,
      exitCode: Math.random() > 0.3 ? 0 : 1,
      stdout: `脚本执行完成\n执行时间: ${duration}ms\n输出: 脚本 "${script.name}" 运行成功`,
      stderr: Math.random() > 0.3 ? '' : '警告: 脚本执行过程中出现了一些警告信息'
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

// 导入脚本
const importScript = () => {
  ElMessage.info('脚本导入功能需要集成 Electron 文件对话框')
}
</script>

<style scoped>
.script-manager {
  height: 100%;
}

.script-card {
  height: 100%;
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
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.script-list {
  flex: 1;
}

.script-editor {
  margin-top: 20px;
}

.editor-card {
  margin-bottom: 20px;
}

.editor-actions {
  display: flex;
  gap: 12px;
}

.script-content {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 14px;
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
