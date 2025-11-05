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
    },
    
    // 获取系统监控数据
    getSystemMonitor: (connectionId) => ipcRenderer.invoke('ssh:getSystemMonitor', connectionId),
    
    // 获取进程列表
    getProcessList: (connectionId) => ipcRenderer.invoke('ssh:getProcessList', connectionId),
    
    // 获取进程详细信息
    getProcessDetail: (connectionId, pid) => ipcRenderer.invoke('ssh:getProcessDetail', connectionId, pid),
    
    // 终止进程
    killProcess: (connectionId, pid, signal) => ipcRenderer.invoke('ssh:killProcess', connectionId, pid, signal),
    
    // 获取网络接口列表
    getNetworkInterfaces: (connectionId) => ipcRenderer.invoke('ssh:getNetworkInterfaces', connectionId),
    
    // 获取网络连接详情
    getNetworkConnections: (connectionId) => ipcRenderer.invoke('ssh:getNetworkConnections', connectionId),
    
    // 检查 nethogs 是否安装
    checkNethogs: (connectionId) => ipcRenderer.invoke('ssh:checkNethogs', connectionId),
    
    // 安装 nethogs
    installNethogs: (connectionId) => ipcRenderer.invoke('ssh:installNethogs', connectionId),
    
    // 获取端口转发列表
    getTunnels: (connectionId) => ipcRenderer.invoke('ssh:getTunnels', connectionId),
    
    // 检查端口转发状态
    checkTunnelStatus: (connectionId, listenHost, listenPort) => 
      ipcRenderer.invoke('ssh:checkTunnelStatus', { connectionId, listenHost, listenPort }),
    
    // 手动启动端口转发
    startTunnel: (connectionId, tunnel) => 
      ipcRenderer.invoke('ssh:startTunnel', { connectionId, tunnel }),
    
    // 手动停止端口转发
    stopTunnel: (connectionId, listenHost, listenPort) => 
      ipcRenderer.invoke('ssh:stopTunnel', { connectionId, listenHost, listenPort }),
    
    // Docker 相关 API
    // 获取 Docker 信息
    getDockerInfo: (connectionId) => ipcRenderer.invoke('ssh:getDockerInfo', connectionId),
    
    // 获取 Docker 容器列表
    getDockerContainers: (connectionId) => ipcRenderer.invoke('ssh:getDockerContainers', connectionId),
    
    // 获取 Docker 镜像列表
    getDockerImages: (connectionId) => ipcRenderer.invoke('ssh:getDockerImages', connectionId),
    
    // 获取容器详情
    getDockerContainerDetail: (connectionId, containerId) => 
      ipcRenderer.invoke('ssh:getDockerContainerDetail', connectionId, containerId),
    
    // 获取容器日志
    getDockerContainerLogs: (connectionId, containerId, tail) => 
      ipcRenderer.invoke('ssh:getDockerContainerLogs', connectionId, containerId, tail),
    
    // 启动实时日志流
    streamDockerContainerLogs: (connectionId, containerId, tail) => 
      ipcRenderer.invoke('ssh:streamDockerContainerLogs', connectionId, containerId, tail),
    
    // 停止实时日志流
    stopDockerLogsStream: (streamId) => 
      ipcRenderer.invoke('ssh:stopDockerLogsStream', streamId),
    
    // 监听 Docker 日志流数据
    onDockerLogsStream: (callback) => {
      ipcRenderer.on('docker:logs-stream', (event, data) => callback(data))
    },
    
    // 监听 Docker 日志流结束
    onDockerLogsStreamEnd: (callback) => {
      ipcRenderer.on('docker:logs-stream-end', (event, data) => callback(data))
    },
    
    // 监听 Docker 日志流错误
    onDockerLogsStreamError: (callback) => {
      ipcRenderer.on('docker:logs-stream-error', (event, data) => callback(data))
    },
    
    // 移除 Docker 日志流监听器
    removeDockerLogsStreamListener: () => {
      ipcRenderer.removeAllListeners('docker:logs-stream')
      ipcRenderer.removeAllListeners('docker:logs-stream-end')
      ipcRenderer.removeAllListeners('docker:logs-stream-error')
    },
    
    // 启动容器
    startDockerContainer: (connectionId, containerId) => 
      ipcRenderer.invoke('ssh:startDockerContainer', connectionId, containerId),
    
    // 停止容器
    stopDockerContainer: (connectionId, containerId) => 
      ipcRenderer.invoke('ssh:stopDockerContainer', connectionId, containerId),
    
    // 重启容器
    restartDockerContainer: (connectionId, containerId) => 
      ipcRenderer.invoke('ssh:restartDockerContainer', connectionId, containerId),
    
    // 删除容器
    removeDockerContainer: (connectionId, containerId) => 
      ipcRenderer.invoke('ssh:removeDockerContainer', connectionId, containerId),
    
    // 删除镜像
    removeDockerImage: (connectionId, imageId) => 
      ipcRenderer.invoke('ssh:removeDockerImage', connectionId, imageId),
    
    // 拉取镜像
    pullDockerImage: (connectionId, imageName) => 
      ipcRenderer.invoke('ssh:pullDockerImage', connectionId, imageName),
    
    // 创建容器
    createDockerContainer: (connectionId, containerConfig) => 
      ipcRenderer.invoke('ssh:createDockerContainer', connectionId, containerConfig),
    
    // Systemctl 服务管理 API
    // 获取服务列表
    getSystemctlServices: (connectionId) => 
      ipcRenderer.invoke('ssh:getSystemctlServices', connectionId),
    
    // 获取服务状态
    getSystemctlServiceStatus: (connectionId, unit) => 
      ipcRenderer.invoke('ssh:getSystemctlServiceStatus', connectionId, unit),
    
    // 获取服务日志
    getSystemctlServiceLogs: (connectionId, unit, lines) => 
      ipcRenderer.invoke('ssh:getSystemctlServiceLogs', connectionId, unit, lines),
    
    // 启动服务
    startSystemctlService: (connectionId, unit) => 
      ipcRenderer.invoke('ssh:startSystemctlService', connectionId, unit),
    
    // 停止服务
    stopSystemctlService: (connectionId, unit) => 
      ipcRenderer.invoke('ssh:stopSystemctlService', connectionId, unit),
    
    // 重启服务
    restartSystemctlService: (connectionId, unit) => 
      ipcRenderer.invoke('ssh:restartSystemctlService', connectionId, unit),
    
    // 启用服务（开机自启）
    enableSystemctlService: (connectionId, unit) => 
      ipcRenderer.invoke('ssh:enableSystemctlService', connectionId, unit),
    
    // 禁用服务（取消开机自启）
    disableSystemctlService: (connectionId, unit) => 
      ipcRenderer.invoke('ssh:disableSystemctlService', connectionId, unit)
  },
  
  // SFTP 相关 API
  sftp: {
    // 列出目录内容
    list: (connectionId, path) => ipcRenderer.invoke('sftp:list', { connectionId, path }),
    
    // 上传文件
    upload: (connectionId, localPath, remotePath) => 
      ipcRenderer.invoke('sftp:upload', { connectionId, localPath, remotePath }),
    
    // 上传文件夹
    uploadDirectory: (connectionId, localPath, remotePath) => 
      ipcRenderer.invoke('sftp:uploadDirectory', { connectionId, localPath, remotePath }),
    
    // 下载文件
    download: (connectionId, remotePath, localPath) => 
      ipcRenderer.invoke('sftp:download', { connectionId, remotePath, localPath }),
    
    // 重命名文件
    rename: (connectionId, oldPath, newPath) => 
      ipcRenderer.invoke('sftp:rename', { connectionId, oldPath, newPath }),
    
    // 监听上传进度
    onProgress: (callback) => {
      ipcRenderer.on('sftp:progress', (event, data) => callback(data))
    },
    
    // 移除上传进度监听
    removeProgressListener: () => {
      ipcRenderer.removeAllListeners('sftp:progress')
    }
  },
  
  // 文件系统 API
  fs: {
    // 读取文件内容
    readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath)
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
  
  // 设置 API
  settings: {
    // 获取下载目录
    getDownloadPath: () => ipcRenderer.invoke('settings:getDownloadPath'),
    
    // 设置下载目录
    setDownloadPath: (path) => ipcRenderer.invoke('settings:setDownloadPath', { path }),
    
    // 选择下载目录
    selectDownloadPath: () => ipcRenderer.invoke('dialog:openDirectory'),
    
    // 获取临时文件目录
    getTempPath: () => ipcRenderer.invoke('settings:getTempPath'),
    
    // 设置临时文件目录
    setTempPath: (path) => ipcRenderer.invoke('settings:setTempPath', { path }),
    
    // 选择临时文件目录
    selectTempPath: () => ipcRenderer.invoke('dialog:openDirectory'),
    
    // 获取默认编辑器路径
    getEditorPath: () => ipcRenderer.invoke('settings:getEditorPath'),
    
    // 设置默认编辑器路径
    setEditorPath: (path) => ipcRenderer.invoke('settings:setEditorPath', { path }),
    
    // 选择编辑器应用
    selectEditor: () => ipcRenderer.invoke('dialog:selectEditor'),
    
    // 获取主题设置
    getTheme: () => ipcRenderer.invoke('settings:getTheme'),
    
    // 设置主题
    setTheme: (theme) => ipcRenderer.invoke('settings:setTheme', { theme }),
    
    // 获取终端字体大小
    getTerminalFontSize: () => ipcRenderer.invoke('settings:getTerminalFontSize'),
    
    // 设置终端字体大小
    setTerminalFontSize: (fontSize) => ipcRenderer.invoke('settings:setTerminalFontSize', { fontSize })
  },
  
  // 系统信息 API
  system: {
    // 获取平台信息
    platform: process.platform,
    
    // 获取版本信息
    versions: process.versions,
    
    // 获取环境变量
    env: process.env,
    
    // 打开文件夹
    openFolder: (folderPath) => ipcRenderer.invoke('system:openFolder', { folderPath }),
    
    // 压缩文件夹（从文件路径）
    compressFolder: (files, folderName) => ipcRenderer.invoke('system:compressFolder', { files, folderName }),
    
    // 压缩文件夹（从文件数据）
    compressFolderFromData: (filesData, folderName) => ipcRenderer.invoke('system:compressFolderFromData', { filesData, folderName }),
    
    // 压缩文件夹（从文件夹路径）
    compressFolderPath: (options) => ipcRenderer.invoke('system:compressFolderPath', options),
    
    // 保存文件到临时目录
    saveFilesToTemp: (options) => ipcRenderer.invoke('system:saveFilesToTemp', options),
    
    // 删除文件
    deleteFile: (filePath) => ipcRenderer.invoke('system:deleteFile', filePath),
    
    // 删除文件夹
    deleteFolder: (folderPath) => ipcRenderer.invoke('system:deleteFolder', folderPath),
    
    // 在文件夹中显示文件
    showItemInFolder: (filePath) => ipcRenderer.invoke('system:showItemInFolder', filePath)
  },
  
  // 打开文件编辑器
  openFileWithEditor: (filePath) => ipcRenderer.invoke('editor:openFile', { filePath }),
  
  // 获取文件修改时间
  getFileModifyTime: (filePath) => ipcRenderer.invoke('file:getModifyTime', { filePath }),
  
  // 监听文件变化
  watchFile: (filePath) => ipcRenderer.invoke('file:watch', { filePath }),
  
  // 获取文件状态（包括修改时间）
  getFileStats: (filePath) => ipcRenderer.invoke('file:getStats', { filePath }),
  
  // 启动文件监听（使用 fs.watch）
  startFileWatch: (options) => ipcRenderer.invoke('file:startWatch', options),
  
  // 停止文件监听
  stopFileWatch: (filePath) => ipcRenderer.invoke('file:stopWatch', { filePath }),
  
  // 监听文件变化事件
  onFileChange: (callback) => {
    ipcRenderer.on('file:changed', (event, data) => callback(data))
  },
  
  // 移除文件变化监听
  removeFileChangeListener: () => {
    ipcRenderer.removeAllListeners('file:changed')
  },
  
  // 选择文件
  selectFiles: (options) => ipcRenderer.invoke('dialog:selectFiles', options)
})

// 连接管理 API
contextBridge.exposeInMainWorld('connectionAPI', {
  // 保存连接配置
  saveConnections: (connections) => ipcRenderer.invoke('connections:save', { connections }),
  
  // 加载连接配置
  loadConnections: () => ipcRenderer.invoke('connections:load'),
  
  // 获取连接文件路径
  getConnectionsPath: () => ipcRenderer.invoke('connections:getPath'),
  
  // 检查是否首次运行
  isFirstRun: () => ipcRenderer.invoke('connections:isFirstRun'),
  
  // 选择连接配置保存路径
  selectPath: () => ipcRenderer.invoke('connections:selectPath'),
  
  // 设置连接配置保存路径
  setPath: (path) => ipcRenderer.invoke('connections:setPath', { path })
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
