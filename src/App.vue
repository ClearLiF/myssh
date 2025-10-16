<template>
  <div id="app">
    <!-- 主内容区域 -->
    <el-container class="main-container">
      <!-- 左侧主机列表 -->
      <el-aside width="280px" class="hosts-sidebar">
        <HostsList @open-connection="handleOpenConnection" />
      </el-aside>

      <!-- 右侧标签页区域 -->
      <el-main class="tabs-content">
        <el-tabs
          v-model="activeTabName"
          type="card"
          closable
          @tab-remove="handleTabRemove"
          class="connection-tabs"
        >
          <el-tab-pane
            v-for="tab in openTabs"
            :key="tab.name"
            :label="tab.label"
            :name="tab.name"
          >
            <ConnectionTab 
              :connection="tab.connection" 
              :tab-id="tab.name"
            />
          </el-tab-pane>
          
          <el-empty v-if="openTabs.length === 0" description="双击左侧主机列表打开连接">
            <template #image>
              <el-icon :size="100" color="#909399">
                <Monitor />
              </el-icon>
            </template>
          </el-empty>
        </el-tabs>
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Monitor } from '@element-plus/icons-vue'
import HostsList from './components/HostsList.vue'
import ConnectionTab from './components/ConnectionTab.vue'

// 打开的标签页列表
const openTabs = ref([])
const activeTabName = ref('')
let tabIndex = 0

// 处理打开连接
const handleOpenConnection = (connection) => {
  // 每次都创建新标签页，允许对同一主机打开多个连接
  const newTabName = `tab-${++tabIndex}`
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  
  openTabs.value.push({
    name: newTabName,
    label: `${connection.name || connection.host} [${timestamp}]`,
    connection: connection
  })
  activeTabName.value = newTabName
}

// 处理关闭标签页
const handleTabRemove = (targetName) => {
  const tabs = openTabs.value
  let activeName = activeTabName.value
  
  if (activeName === targetName) {
    tabs.forEach((tab, index) => {
      if (tab.name === targetName) {
        const nextTab = tabs[index + 1] || tabs[index - 1]
        if (nextTab) {
          activeName = nextTab.name
        }
      }
    })
  }
  
  activeTabName.value = activeName
  openTabs.value = tabs.filter(tab => tab.name !== targetName)
}
</script>

<style scoped>
#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #0d1117 0%, #161b22 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
}

.main-container {
  flex: 1;
  height: 100vh;
  overflow: hidden;
}

.hosts-sidebar {
  background: linear-gradient(180deg, #1a1a1d 0%, #252526 100%);
  border-right: 1px solid rgba(48, 54, 61, 0.5);
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 10;
}

.tabs-content {
  padding: 0;
  background: linear-gradient(135deg, #0d1117 0%, #161b22 100%);
  overflow: hidden;
}

.connection-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.connection-tabs :deep(.el-tabs__header) {
  margin: 0;
  background: linear-gradient(135deg, rgba(22, 27, 34, 0.95) 0%, rgba(26, 31, 38, 0.95) 100%);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(48, 54, 61, 0.5);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.connection-tabs :deep(.el-tabs__nav-wrap)::after {
  display: none;
}

.connection-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
  padding: 0;
}

.connection-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: hidden;
}

.connection-tabs :deep(.el-tabs__item) {
  color: #8b949e;
  border: none;
  background: transparent;
  font-weight: 500;
  font-size: 13px;
  transition: all 0.3s;
  padding: 0 20px;
  height: 40px;
  line-height: 40px;
}

.connection-tabs :deep(.el-tabs__item:hover) {
  color: #c9d1d9;
  background: rgba(255, 255, 255, 0.03);
}

.connection-tabs :deep(.el-tabs__item.is-active) {
  color: #ffffff;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%);
  border-bottom: 2px solid;
  border-image: linear-gradient(90deg, #667eea 0%, #764ba2 100%) 1;
}

.connection-tabs :deep(.el-tabs__item .el-icon-close) {
  transition: all 0.2s;
}

.connection-tabs :deep(.el-tabs__item .el-icon-close:hover) {
  background: rgba(255, 255, 255, 0.1);
  color: #ff7b72;
}
</style>
