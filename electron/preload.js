const { contextBridge, ipcRenderer } = require('electron')

// 暴露受保护的 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // SSH 相关 API
  ssh: {
    // 连接 SSH
    connect: (config) => ipcRenderer.invoke('ssh:connect', config),
    
    // 断开 SSH 连接
    disconnect: (connectionId) => ipcRenderer.invoke('ssh:disconnect', connectionId),
    
    // 执行 SSH 命令
    execute: (connectionId, command) => ipcRenderer.invoke('ssh:execute', { connectionId, command }),
    
    // 中断流式命令
    interrupt: (connectionId) => ipcRenderer.invoke('ssh:interrupt', connectionId),
    
    // 监听流式数据
    onStreamData: (callback) => {
      ipcRenderer.on('ssh:stream-data', (event, data) => callback(data))
    },
    
    // 监听流式结束
    onStreamEnd: (callback) => {
      ipcRenderer.on('ssh:stream-end', (event, data) => callback(data))
    },
    
    // 移除监听器
    removeStreamDataListener: () => {
      ipcRenderer.removeAllListeners('ssh:stream-data')
    },
    
    removeStreamEndListener: () => {
      ipcRenderer.removeAllListeners('ssh:stream-end')
    },
    
    // PTY 相关 API
    createPty: (connectionId, cols, rows) => ipcRenderer.invoke('ssh:create-pty', { connectionId, cols, rows }),
    
    ptyWrite: (connectionId, data) => ipcRenderer.invoke('ssh:pty-write', { connectionId, data }),
    
    ptyResize: (connectionId, cols, rows) => ipcRenderer.invoke('ssh:pty-resize', { connectionId, cols, rows }),
    
    onPtyData: (callback) => {
      ipcRenderer.on('ssh:pty-data', (event, data) => callback(data))
    },
    
    onPtyClose: (callback) => {
      ipcRenderer.on('ssh:pty-close', (event, data) => callback(data))
    },
    
    removePtyDataListener: () => {
      ipcRenderer.removeAllListeners('ssh:pty-data')
    },
    
    removePtyCloseListener: () => {
      ipcRenderer.removeAllListeners('ssh:pty-close')
    }
  },
  
  // SFTP 相关 API
  sftp: {
    // 列出目录内容
    list: (connectionId, path) => ipcRenderer.invoke('sftp:list', { connectionId, path }),
    
    // 上传文件
    upload: (connectionId, localPath, remotePath) => 
      ipcRenderer.invoke('sftp:upload', { connectionId, localPath, remotePath }),
    
    // 下载文件
    download: (connectionId, remotePath, localPath) => 
      ipcRenderer.invoke('sftp:download', { connectionId, remotePath, localPath })
  },
  
  // 文件对话框 API
  dialog: {
    // 打开文件
    openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
    
    // 打开目录
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    
    // 保存文件
    saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options)
  },
  
  // 系统信息 API
  system: {
    // 获取平台信息
    platform: process.platform,
    
    // 获取版本信息
    versions: process.versions,
    
    // 获取环境变量
    env: process.env
  }
})

// 监听来自主进程的消息
ipcRenderer.on('main-process-message', (event, message) => {
  console.log('收到主进程消息:', message)
})

// 监听 SSH 连接状态变化
ipcRenderer.on('ssh:connection-status', (event, status) => {
  console.log('SSH 连接状态:', status)
})

// 监听文件传输进度
ipcRenderer.on('sftp:transfer-progress', (event, progress) => {
  console.log('文件传输进度:', progress)
})

// 监听系统监控数据
ipcRenderer.on('system:monitor-data', (event, data) => {
  console.log('系统监控数据:', data)
})

// 错误处理
window.addEventListener('error', (event) => {
  console.error('渲染进程错误:', event.error)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('未处理的 Promise 拒绝:', event.reason)
})

// 开发环境下的调试信息
if (process.env.NODE_ENV === 'development') {
  console.log('预加载脚本已加载')
  console.log('可用的 API:', Object.keys(window.electronAPI))
}
