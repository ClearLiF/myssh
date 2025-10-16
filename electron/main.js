const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { NodeSSH } = require('node-ssh')

// 保持对窗口对象的全局引用
let mainWindow
let sshConnections = new Map()
let activeStreams = new Map() // 保存活跃的流式连接

async function createWindow() {
  console.log('开始创建窗口...')
  
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    // icon: path.join(__dirname, 'assets/icon.png'),  // 图标文件可能不存在
    titleBarStyle: 'default',
    show: false,  // 等待加载完成后再显示
    center: true,  // 居中显示
    backgroundColor: '#ffffff'
  })
  
  console.log('窗口对象已创建')

  // 当窗口准备好显示时再显示
  mainWindow.once('ready-to-show', () => {
    console.log('窗口准备就绪，显示窗口')
    mainWindow.show()
    mainWindow.focus()
  })

  // 加载应用
  // 始终尝试加载开发服务器，如果失败则加载生产文件
  console.log('尝试加载开发服务器...')
  
  try {
    await mainWindow.loadURL('http://localhost:5173')
    console.log('开发服务器加载成功')
    // 打开开发者工具
    mainWindow.webContents.openDevTools()
  } catch (error) {
    console.error('无法连接到开发服务器，尝试加载生产文件...', error.message)
    try {
      await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
      console.log('生产文件加载成功')
    } catch (prodError) {
      console.error('生产文件也无法加载，显示错误页面', prodError.message)
      await mainWindow.loadURL('data:text/html,<h1>加载失败</h1><p>请确保运行了 npm run dev 或 npm run build</p>')
    }
  }

  console.log('页面加载完成，准备显示窗口')

  // 当窗口关闭时触发
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 处理窗口大小变化
  mainWindow.on('resize', () => {
    // 可以在这里处理窗口大小变化逻辑
  })
}

// 当 Electron 完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(async () => {
  await createWindow()
  
  // 强制应用获得焦点
  app.focus({ steal: true })

  app.on('activate', () => {
    console.log('应用被激活')
    // 在 macOS 上，当点击 dock 图标并且没有其他窗口打开时，
    // 通常在应用程序中重新创建一个窗口。
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      // 如果窗口存在但被隐藏，显示它
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
})

// 当所有窗口都关闭时退出应用
app.on('window-all-closed', () => {
  // 在 macOS 上，除非用户用 Cmd + Q 确定地退出，
  // 否则绝大部分应用及其菜单栏会保持激活。
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 处理应用激活事件
app.on('activate', () => {
  // 在 macOS 上，当点击 dock 图标并且没有其他窗口打开时，
  // 通常在应用程序中重新创建一个窗口。
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// IPC 处理器 - SSH 连接
ipcMain.handle('ssh:connect', async (event, config) => {
  try {
    console.log('收到 SSH 连接请求:', config)
    
    const ssh = new NodeSSH()
    
    // 只提取需要的配置属性，避免序列化问题
    const connectionConfig = {
      host: String(config.host),
      port: Number(config.port),
      username: String(config.username),
      readyTimeout: 20000,
      keepaliveInterval: 10000
    }

    if (config.authType === 'password' && config.password) {
      connectionConfig.password = String(config.password)
    } else if (config.authType === 'privateKey' && config.privateKeyPath) {
      connectionConfig.privateKey = String(config.privateKeyPath)
    }

    console.log('尝试连接 SSH:', { host: connectionConfig.host, port: connectionConfig.port, username: connectionConfig.username })
    
    await ssh.connect(connectionConfig)
    
    const connectionId = Date.now().toString()
    sshConnections.set(connectionId, ssh)
    
    console.log('SSH 连接成功，连接ID:', connectionId)
    
    return {
      success: true,
      connectionId: connectionId,
      message: 'SSH 连接成功'
    }
  } catch (error) {
    console.error('SSH 连接失败:', error)
    return {
      success: false,
      message: error.message || '连接失败'
    }
  }
})

// IPC 处理器 - SSH 断开连接
ipcMain.handle('ssh:disconnect', async (event, connectionId) => {
  try {
    const ssh = sshConnections.get(connectionId)
    if (ssh) {
      ssh.dispose()
      sshConnections.delete(connectionId)
      return { success: true, message: '连接已断开' }
    }
    return { success: false, message: '连接不存在' }
  } catch (error) {
    return { success: false, message: error.message }
  }
})

// IPC 处理器 - 执行 SSH 命令（支持实时流式输出）
ipcMain.handle('ssh:execute', async (event, { connectionId, command }) => {
  try {
    console.log('执行 SSH 命令:', { connectionId, command })
    
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }
    
    // 如果是 cd 命令，需要保存工作目录状态
    let actualCommand = String(command)
    
    // 获取当前工作目录（如果有的话）
    if (!ssh.currentDir) {
      ssh.currentDir = '~' // 默认是 home 目录
    }
    
    if (actualCommand.startsWith('cd ')) {
      const targetDir = actualCommand.substring(3).trim() || '~'
      // 更新当前目录
      if (targetDir.startsWith('/')) {
        ssh.currentDir = targetDir
      } else if (targetDir === '~') {
        ssh.currentDir = '~'
      } else {
        ssh.currentDir = ssh.currentDir === '~' ? targetDir : `${ssh.currentDir}/${targetDir}`
      }
      // 对于 cd 命令，我们执行它但也要更新提示符
      actualCommand = `cd ${targetDir} && pwd`
    } else if (!actualCommand.startsWith('cd')) {
      // 对于非 cd 命令，在当前目录下执行
      if (ssh.currentDir && ssh.currentDir !== '~') {
        actualCommand = `cd ${ssh.currentDir} && ${actualCommand}`
      }
    }
    
    // 检查是否是流式命令（如 tail -f, docker logs -f 等）
    const isStreamingCommand = actualCommand.includes(' -f') || 
                               actualCommand.includes('tail -f') || 
                               actualCommand.includes('docker logs')
    
    if (isStreamingCommand) {
      // 使用流式执行
      return new Promise((resolve, reject) => {
        ssh.connection.exec(actualCommand, (err, stream) => {
          if (err) {
            reject(err)
            return
          }
          
          // 保存stream以便可以中断
          activeStreams.set(String(connectionId), stream)
          
          let hasOutput = false
          let resolved = false
          
          // 监听标准输出
          stream.on('data', (data) => {
            hasOutput = true
            const output = data.toString()
            console.log('实时输出:', output)
            // 发送实时数据到前端
            event.sender.send('ssh:stream-data', {
              connectionId,
              type: 'stdout',
              data: output
            })
          })
          
          // 监听错误输出
          stream.stderr.on('data', (data) => {
            hasOutput = true
            const output = data.toString()
            console.log('实时错误输出:', output)
            event.sender.send('ssh:stream-data', {
              connectionId,
              type: 'stderr',
              data: output
            })
          })
          
          // 命令结束
          stream.on('close', (code, signal) => {
            console.log('命令执行完成，退出码:', code, '信号:', signal)
            activeStreams.delete(String(connectionId))
            event.sender.send('ssh:stream-end', { connectionId })
            if (!resolved) {
              resolved = true
              resolve({
                success: true,
                stdout: '',
                stderr: '',
                exitCode: code || 0,
                currentDir: ssh.currentDir || '~',
                streaming: true
              })
            }
          })
          
          // 如果2秒后还没有输出，说明命令已经开始运行
          setTimeout(() => {
            if (!hasOutput && !resolved) {
              resolved = true
              resolve({
                success: true,
                stdout: '',
                stderr: '',
                exitCode: 0,
                currentDir: ssh.currentDir || '~',
                streaming: true
              })
            }
          }, 2000)
        })
      })
    } else {
      // 普通命令，使用原来的方式
      const result = await ssh.execCommand(actualCommand)
      
      console.log('命令执行结果:', { 
        stdout: result.stdout || '(空)', 
        stderr: result.stderr || '(空)', 
        code: result.code 
      })
      
      return {
        success: true,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.code || 0,
        currentDir: ssh.currentDir || '~',
        streaming: false
      }
    }
  } catch (error) {
    console.error('命令执行失败:', error)
    return {
      success: false,
      message: error.message || '命令执行失败'
    }
  }
})

// IPC 处理器 - 中断流式命令
ipcMain.handle('ssh:interrupt', async (event, connectionId) => {
  try {
    console.log('收到中断请求:', connectionId)
    const stream = activeStreams.get(String(connectionId))
    
    if (stream) {
      console.log('发送 SIGINT 信号中断流式命令')
      // 发送 Ctrl+C 信号（SIGINT）
      stream.signal('INT')
      // 或者直接结束stream
      stream.end()
      stream.close()
      
      activeStreams.delete(String(connectionId))
      
      return {
        success: true,
        message: '命令已中断'
      }
    }
    
    return {
      success: false,
      message: '没有找到活跃的流式命令'
    }
  } catch (error) {
    console.error('中断命令失败:', error)
    return {
      success: false,
      message: error.message || '中断失败'
    }
  }
})

// IPC 处理器 - SFTP 操作
ipcMain.handle('sftp:list', async (event, { connectionId, path }) => {
  try {
    console.log('SFTP list 请求:', { connectionId, path })
    
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }
    
    // 使用 execCommand 来列出文件
    const command = path === '/' ? 'ls -la /' : `ls -la ${path}`
    const result = await ssh.execCommand(command)
    
    if (result.code !== 0) {
      throw new Error(result.stderr || '列出文件失败')
    }
    
    // 解析 ls -la 的输出
    const lines = result.stdout.split('\n').filter(line => line.trim())
    const files = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.startsWith('total') || line === '') continue
      
      const parts = line.split(/\s+/)
      if (parts.length < 9) continue
      
      const permissions = parts[0]
      const size = parseInt(parts[4]) || 0
      const name = parts.slice(8).join(' ')
      
      // 跳过 . 和 ..
      if (name === '.' || name === '..') continue
      
      files.push({
        name: name,
        size: size,
        isDirectory: permissions.startsWith('d'),
        modifiedTime: new Date().toISOString() // 简化版本，可以后续解析实际时间
      })
    }
    
    console.log('SFTP list 结果:', files.length, '个文件')
    
    return {
      success: true,
      files: files
    }
  } catch (error) {
    console.error('SFTP list 失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 文件上传
ipcMain.handle('sftp:upload', async (event, { connectionId, localPath, remotePath }) => {
  try {
    const ssh = sshConnections.get(connectionId)
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }
    
    await ssh.putFile(localPath, remotePath)
    
    return {
      success: true,
      message: '文件上传成功'
    }
  } catch (error) {
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 文件下载
ipcMain.handle('sftp:download', async (event, { connectionId, remotePath, localPath }) => {
  try {
    const ssh = sshConnections.get(connectionId)
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }
    
    await ssh.getFile(localPath, remotePath)
    
    return {
      success: true,
      message: '文件下载成功'
    }
  } catch (error) {
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 选择文件
ipcMain.handle('dialog:openFile', async (event, options) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      ...options
    })
    
    if (!result.canceled) {
      return { success: true, filePath: result.filePaths[0] }
    } else {
      return { success: false, message: '用户取消了文件选择' }
    }
  } catch (error) {
    return { success: false, message: error.message }
  }
})

// IPC 处理器 - 选择目录
ipcMain.handle('dialog:openDirectory', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    
    if (!result.canceled) {
      return { success: true, directoryPath: result.filePaths[0] }
    } else {
      return { success: false, message: '用户取消了目录选择' }
    }
  } catch (error) {
    return { success: false, message: error.message }
  }
})

// IPC 处理器 - 保存文件
ipcMain.handle('dialog:saveFile', async (event, options) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, options)
    
    if (!result.canceled) {
      return { success: true, filePath: result.filePath }
    } else {
      return { success: false, message: '用户取消了文件保存' }
    }
  } catch (error) {
    return { success: false, message: error.message }
  }
})

// 安全处理：防止新窗口创建
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault()
    // 可以在这里处理新窗口逻辑，比如在主窗口中打开
  })
})

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error)
  // 在生产环境中，你可能想要记录错误并优雅地处理
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason)
  // 在生产环境中，你可能想要记录错误并优雅地处理
})
