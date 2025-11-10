<template>
  <div class="connection-tab">
    <SSHTerminal 
      :connection="connection" 
      :tab-mode="true"
      ref="sshTerminalRef"
      @connected="handleConnected"
      @open-sftp="handleOpenSFTP"
      @open-process-monitor="handleOpenProcessMonitor"
      @open-network-monitor="handleOpenNetworkMonitor"
      @open-docker-manager="handleOpenDockerManager"
      @open-systemctl-manager="handleOpenSystemctlManager"
    />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import SSHTerminal from './SSHTerminalTab.vue'

const props = defineProps({
  connection: {
    type: Object,
    required: true
  },
  tabId: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['open-sftp', 'open-process-monitor', 'open-network-monitor', 'open-docker-manager', 'open-systemctl-manager'])

const sshTerminalRef = ref(null)
const connectionId = ref(null)

// 监听SSH终端的连接状态，获取connectionId
watch(() => sshTerminalRef.value, (terminal) => {
  if (terminal && terminal.connectionId) {
    connectionId.value = terminal.connectionId.value
  }
}, { deep: true, immediate: true })

// 处理 SSH 连接成功事件
const handleConnected = (id) => {
  connectionId.value = id
  console.log('ConnectionTab 收到连接成功事件，connectionId:', id)
}

// 处理打开 SFTP 请求
const handleOpenSFTP = (data) => {
  console.log('📂 ConnectionTab 处理打开 SFTP 请求')
  console.log('  - data.connectionId:', data.connectionId)
  console.log('  - connectionId.value:', connectionId.value)
  
  const finalConnectionId = data.connectionId || connectionId.value
  console.log('  - 最终 connectionId:', finalConnectionId)
  
  if (!finalConnectionId) {
    console.error('❌ connectionId 为空，无法打开 SFTP')
  }
  
  emit('open-sftp', {
    connection: props.connection,
    connectionId: finalConnectionId
  })
}

// 处理打开进程监控请求
const handleOpenProcessMonitor = (data) => {
  emit('open-process-monitor', {
    connection: props.connection,
    connectionId: data.connectionId || connectionId.value
  })
}

// 处理打开网络监控请求
const handleOpenNetworkMonitor = (data) => {
  emit('open-network-monitor', {
    connection: props.connection,
    connectionId: data.connectionId || connectionId.value
  })
}

// 处理打开 Docker 管理请求
const handleOpenDockerManager = (data) => {
  emit('open-docker-manager', {
    connection: props.connection,
    connectionId: data.connectionId || connectionId.value
  })
}

// 处理打开 Systemctl 管理请求
const handleOpenSystemctlManager = (data) => {
  emit('open-systemctl-manager', {
    connection: props.connection,
    connectionId: data.connectionId || connectionId.value
  })
}
</script>

<style scoped>
.connection-tab {
  height: 100%;
  width: 100%;
  background: linear-gradient(180deg, #0d1117 0%, #161b22 100%);
  overflow: hidden;
}
</style>

