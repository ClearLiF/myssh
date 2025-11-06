<template>
  <div class="import-connections">
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>导入FinalShell连接</span>
          <el-button 
            type="primary" 
            @click="importConnections"
            :loading="importing"
          >
            导入连接
          </el-button>
        </div>
      </template>
      
      <div v-if="importStats">
        <el-alert
          :title="`成功导入 ${importStats.added} 个新连接，总计 ${importStats.total} 个连接`"
          type="success"
          :closable="false"
          show-icon
        />
        
        <div class="group-stats" v-if="importStats.groups">
          <h4>分组统计：</h4>
          <el-tag 
            v-for="(count, group) in importStats.groups" 
            :key="group"
            class="group-tag"
            type="info"
          >
            {{ group }}: {{ count }} 个
          </el-tag>
        </div>
      </div>
      
      <div v-if="!importStats" class="import-info">
        <p>此功能将导入从FinalShell导出的连接配置。</p>
        <p>导入的连接将保持原有的分组结构。</p>
        <el-alert
          title="注意：密码可能需要重新输入"
          description="由于FinalShell的密码加密方式，部分密码可能无法正确解密，需要您重新输入。"
          type="warning"
          :closable="false"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const importing = ref(false)
const importStats = ref(null)

// 导入连接
const importConnections = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要导入FinalShell连接吗？这将会添加新的连接到您的连接列表中。',
      '确认导入',
      {
        confirmButtonText: '确定导入',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    importing.value = true
    
    // 读取导入的连接文件
    const fs = require('fs')
    const path = require('path')
    const importedFilePath = path.join(process.cwd(), 'imported_connections.json')
    
    if (!fs.existsSync(importedFilePath)) {
      ElMessage.error('导入文件不存在，请先运行导入脚本')
      return
    }
    
    const importedData = fs.readFileSync(importedFilePath, 'utf8')
    const importedConnections = JSON.parse(importedData)
    
    // 获取现有连接
    let existingConnections = []
    if (window.connectionAPI) {
      const result = await window.connectionAPI.loadConnections()
      if (result.success) {
        existingConnections = result.connections
      }
    } else {
      // 降级到 localStorage
      const saved = localStorage.getItem('ssh-connections')
      if (saved) {
        existingConnections = JSON.parse(saved)
      }
    }
    
    // 合并连接（避免重复）
    const allConnections = [...existingConnections]
    let addedCount = 0
    
    importedConnections.forEach(newConn => {
      // 检查是否已存在相同的连接
      const exists = existingConnections.some(existing => 
        existing.host === newConn.host && 
        existing.port === newConn.port && 
        existing.username === newConn.username
      )
      
      if (!exists) {
        allConnections.push(newConn)
        addedCount++
      }
    })
    
    // 保存合并后的连接
    if (window.connectionAPI) {
      const result = await window.connectionAPI.saveConnections(allConnections)
      if (!result.success) {
        throw new Error(result.message)
      }
    } else {
      // 降级到 localStorage
      localStorage.setItem('ssh-connections', JSON.stringify(allConnections))
    }
    
    // 统计分组信息
    const groupStats = {}
    allConnections.forEach(conn => {
      const group = conn.group || '根目录'
      groupStats[group] = (groupStats[group] || 0) + 1
    })
    
    importStats.value = {
      added: addedCount,
      total: allConnections.length,
      groups: groupStats
    }
    
    ElMessage.success(`成功导入 ${addedCount} 个新连接`)
    
  } catch (error) {
    if (error.message !== 'cancel') {
      console.error('导入连接失败:', error)
      ElMessage.error('导入连接失败: ' + error.message)
    }
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.import-connections {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.import-info {
  margin: 20px 0;
}

.group-stats {
  margin-top: 20px;
}

.group-tag {
  margin: 5px 5px 5px 0;
}
</style>
