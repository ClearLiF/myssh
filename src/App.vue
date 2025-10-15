<template>
  <div id="app">
    <!-- 顶部工具栏 -->
    <el-header class="app-header">
      <div class="header-content">
        <h1 class="app-title">
          <el-icon><Setting /></el-icon>
          MySSH
        </h1>
        <div class="header-actions">
          <el-button type="primary" size="small">
            <el-icon><Plus /></el-icon>
            新建连接
          </el-button>
        </div>
      </div>
    </el-header>

    <!-- 主内容区域 -->
    <el-container class="main-container">
      <!-- 左侧菜单 -->
      <el-aside width="250px" class="sidebar">
        <el-menu
          :default-active="activeMenu"
          class="sidebar-menu"
          @select="handleMenuSelect"
        >
          <el-menu-item index="ssh">
            <el-icon><Setting /></el-icon>
            <span>SSH 终端</span>
          </el-menu-item>
          <el-menu-item index="sftp">
            <el-icon><Folder /></el-icon>
            <span>文件传输</span>
          </el-menu-item>
          <el-menu-item index="scripts">
            <el-icon><Document /></el-icon>
            <span>脚本管理</span>
          </el-menu-item>
          <el-menu-item index="monitor">
            <el-icon><Monitor /></el-icon>
            <span>系统监控</span>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <!-- 右侧详情内容区域 -->
      <el-main class="main-content">
        <component :is="currentComponent" />
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Setting, Plus, Folder, Document, Monitor } from '@element-plus/icons-vue'
import SSHTerminal from './components/SSHTerminal.vue'
import SFTPManager from './components/SFTPManager.vue'
import ScriptManager from './components/ScriptManager.vue'
import SystemMonitor from './components/SystemMonitor.vue'

const activeMenu = ref('ssh')

const currentComponent = computed(() => {
  switch (activeMenu.value) {
    case 'ssh':
      return SSHTerminal
    case 'sftp':
      return SFTPManager
    case 'scripts':
      return ScriptManager
    case 'monitor':
      return SystemMonitor
    default:
      return SSHTerminal
  }
})

const handleMenuSelect = (index) => {
  activeMenu.value = index
}
</script>

<style scoped>
#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  padding: 0 20px;
}

.app-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.main-container {
  flex: 1;
  height: calc(100vh - 60px);
}

.sidebar {
  background: #f5f7fa;
  border-right: 1px solid #e4e7ed;
}

.sidebar-menu {
  border: none;
  height: 100%;
}

.main-content {
  padding: 20px;
  background: #ffffff;
}
</style>
