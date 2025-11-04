const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { NodeSSH } = require('node-ssh')
const net = require('net')

// 保持对窗口对象的全局引用
let mainWindow
let sshConnections = new Map()
let activeStreams = new Map() // 保存活跃的流式连接
let activeTunnels = new Map() // 保存活跃的SSH隧道 key: connectionId, value: Array of {tunnel, server}

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

// SSH隧道建立函数
async function setupTunnel(ssh, connectionId, tunnel) {
  return new Promise((resolve, reject) => {
    const { type, name, listenHost, listenPort, targetHost, targetPort } = tunnel
    
    if (type === 'local') {
      // 本地端口转发: 本地端口 -> SSH服务器 -> 目标地址:端口
      // 相当于: ssh -L listenPort:targetHost:targetPort user@host

      const server = net.createServer((clientSocket) => {
        console.log(`🔗 新的本地转发连接: ${listenHost}:${listenPort} -> ${targetHost}:${targetPort}`)

        // 保存 socket 引用以便后续关闭
        if (!server.sockets) {
          server.sockets = new Set()
        }
        server.sockets.add(clientSocket)

        clientSocket.on('close', () => {
          server.sockets.delete(clientSocket)
        })

        // 通过SSH连接转发到目标
        ssh.connection.forwardOut(
          '127.0.0.1', // 源IP
          0, // 源端口（0表示随机）
          targetHost,
          targetPort,
          (err, sshStream) => {
            if (err) {
              console.error('转发失败:', err)
              clientSocket.end()
              return
            }

            // 双向数据转发
            clientSocket.pipe(sshStream).pipe(clientSocket)

            sshStream.on('close', () => {
              clientSocket.end()
            })

            clientSocket.on('close', () => {
              sshStream.end()
            })
          }
        )
      })

      server.on('error', (err) => {
        reject(new Error(`端口 ${listenPort} 监听失败: ${err.message}`))
      })

      server.listen(listenPort, listenHost, () => {
        console.log(`✅ 本地转发已建立: ${listenHost}:${listenPort} -> ${targetHost}:${targetPort}`)

        // 保存隧道信息
        if (!activeTunnels.has(connectionId)) {
          activeTunnels.set(connectionId, [])
        }
        activeTunnels.get(connectionId).push({
          tunnel: tunnel,
          server: server
        })

        resolve()
      })
      
    } else if (type === 'remote') {
      // 远程端口转发: SSH服务器端口 -> 本地 -> 目标地址:端口
      // 相当于: ssh -R listenPort:targetHost:targetPort user@host
      
      ssh.connection.forwardIn(listenHost, listenPort, (err) => {
        if (err) {
          reject(new Error(`远程转发失败: ${err.message}`))
          return
        }
        
        console.log(`✅ 远程转发已建立: 服务器${listenHost}:${listenPort} -> ${targetHost}:${targetPort}`)
        
        ssh.connection.on('tcp connection', (info, accept, reject) => {
          if (info.destPort === listenPort) {
            console.log(`🔗 新的远程转发连接: ${targetHost}:${targetPort}`)
            
            const sshStream = accept()
            const targetSocket = net.connect(targetPort, targetHost, () => {
              sshStream.pipe(targetSocket).pipe(sshStream)
            })
            
            targetSocket.on('error', (err) => {
              console.error('目标连接失败:', err)
              sshStream.end()
            })
            
            sshStream.on('close', () => {
              targetSocket.end()
            })
          }
        })
        
        // 保存隧道信息
        if (!activeTunnels.has(connectionId)) {
          activeTunnels.set(connectionId, [])
        }
        activeTunnels.get(connectionId).push({
          tunnel: tunnel,
          server: null // 远程转发没有本地服务器
        })
        
        resolve()
      })
      
    } else if (type === 'dynamic') {
      // 动态端口转发 (SOCKS5代理)
      // 相当于: ssh -D listenPort user@host
      // 注意：完整实现SOCKS5协议比较复杂，这里暂时不实现
      reject(new Error('动态转发 (SOCKS5) 暂不支持，请使用本地或远程转发'))
    } else {
      reject(new Error(`未知的隧道类型: ${type}`))
    }
  })
}

// 清理连接的所有隧道
function cleanupTunnels(connectionId) {
  const connId = String(connectionId)
  const tunnels = activeTunnels.get(connId)
  
  if (tunnels && tunnels.length > 0) {
    console.log(`🔌 开始清理连接 ${connId} 的 ${tunnels.length} 个隧道...`)
    
    tunnels.forEach(({ tunnel, server }) => {
      try {
        if (server) {
          server.close((err) => {
            if (err) {
              console.error(`关闭隧道 "${tunnel.name}" 失败:`, err.message)
            } else {
              console.log(`✅ 已关闭隧道: ${tunnel.name} (${tunnel.listenHost}:${tunnel.listenPort})`)
            }
          })
        }
      } catch (error) {
        console.error(`关闭隧道 "${tunnel.name}" 时发生错误:`, error.message)
      }
    })
    
    activeTunnels.delete(connId)
    console.log(`✅ 连接 ${connId} 的所有隧道已清理完成`)
  } else {
    console.log(`ℹ️  连接 ${connId} 没有需要清理的隧道`)
  }
}

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
    
    // 建立SSH隧道（如果配置了）
    const tunnelResults = []
    if (config.tunnels && Array.isArray(config.tunnels)) {
      for (const tunnel of config.tunnels) {
        try {
          await setupTunnel(ssh, connectionId, tunnel)
          tunnelResults.push({
            name: tunnel.name,
            success: true
          })
          console.log(`✅ 隧道 "${tunnel.name}" 已建立`)
        } catch (error) {
          console.error(`❌ 隧道 "${tunnel.name}" 建立失败:`, error.message)
          tunnelResults.push({
            name: tunnel.name,
            success: false,
            error: error.message
          })
        }
      }
    }
    
    return {
      success: true,
      connectionId: connectionId,
      message: 'SSH 连接成功',
      tunnels: tunnelResults
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
    const connId = String(connectionId)
    console.log(`🔌 准备断开连接: ${connId}`)
    
    const ssh = sshConnections.get(connId)
    if (ssh) {
      // 先清理所有隧道
      cleanupTunnels(connId)
      
      // 等待一小段时间确保隧道完全关闭
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // 断开SSH连接
      ssh.dispose()
      sshConnections.delete(connId)
      
      console.log(`✅ 连接 ${connId} 已完全断开`)
      return { success: true, message: '连接已断开' }
    }
    
    console.log(`⚠️  连接 ${connId} 不存在`)
    return { success: false, message: '连接不存在' }
  } catch (error) {
    console.error(`断开连接失败:`, error)
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
    
    // 检查是否是交互式命令（需要 PTY 支持）
    const interactiveCommands = ['vim', 'vi', 'nano', 'emacs', 'top', 'htop', 'less', 'more', 'man']
    const cmdName = String(command).trim().split(/\s+/)[0]
    if (interactiveCommands.includes(cmdName)) {
      return {
        success: false,
        message: `不支持交互式命令 '${cmdName}'`,
        error: '当前终端不支持需要 PTY 的交互式命令'
      }
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

// IPC 处理器 - SFTP 重命名文件
ipcMain.handle('sftp:rename', async (event, { connectionId, oldPath, newPath }) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }
    
    const command = `mv "${oldPath}" "${newPath}"`
    const result = await ssh.execCommand(command)
    
    if (result.code !== 0) {
      throw new Error(result.stderr || '重命名失败')
    }
    
    return {
      success: true,
      message: '文件重命名成功'
    }
  } catch (error) {
    console.error('SFTP 重命名失败:', error)
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

// IPC 处理器 - 上传文件夹（递归）
ipcMain.handle('sftp:uploadDirectory', async (event, { connectionId, localPath, remotePath }) => {
  try {
    const path = require('path')
    const fs = require('fs')
    const ssh = sshConnections.get(connectionId)
    
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    // 递归上传文件夹
    const uploadDirectory = async (localDir, remoteDir) => {
      // 创建远程目录
      await ssh.exec(`mkdir -p "${remoteDir}"`)
      
      // 读取本地文件夹
      const files = fs.readdirSync(localDir)
      
      for (const file of files) {
        const localFilePath = path.join(localDir, file)
        const remoteFilePath = `${remoteDir}/${file}`
        const stat = fs.statSync(localFilePath)
        
        if (stat.isDirectory()) {
          // 递归上传子文件夹
          await uploadDirectory(localFilePath, remoteFilePath)
        } else {
          // 上传文件
          await ssh.putFile(localFilePath, remoteFilePath)
        }
      }
    }

    await uploadDirectory(localPath, remotePath)
    
    return {
      success: true,
      message: '文件夹上传成功'
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

// 设置存储
const Store = require('electron-store')
const store = new Store()
const DEFAULT_DOWNLOAD_PATH = app.getPath('downloads')
const DEFAULT_TEMP_PATH = app.getPath('temp')

// IPC 处理器 - 获取下载位置
ipcMain.handle('settings:getDownloadPath', async (event) => {
  try {
    const downloadPath = store.get('downloadPath', DEFAULT_DOWNLOAD_PATH)
    return {
      success: true,
      path: downloadPath
    }
  } catch (error) {
    return {
      success: false,
      message: error.message,
      path: DEFAULT_DOWNLOAD_PATH
    }
  }
})

// IPC 处理器 - 设置下载位置
ipcMain.handle('settings:setDownloadPath', async (event, { path }) => {
  try {
    store.set('downloadPath', path)
    return {
      success: true,
      message: '下载位置设置成功',
      path: path
    }
  } catch (error) {
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 获取临时文件目录
ipcMain.handle('settings:getTempPath', async (event) => {
  try {
    const tempPath = store.get('tempPath', DEFAULT_TEMP_PATH)
    return {
      success: true,
      path: tempPath
    }
  } catch (error) {
    return {
      success: false,
      message: error.message,
      path: DEFAULT_TEMP_PATH
    }
  }
})

// IPC 处理器 - 设置临时文件目录
ipcMain.handle('settings:setTempPath', async (event, { path }) => {
  try {
    store.set('tempPath', path)
    return {
      success: true,
      message: '临时文件目录设置成功',
      path: path
    }
  } catch (error) {
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 获取默认编辑器路径
ipcMain.handle('settings:getEditorPath', async (event) => {
  try {
    const editorPath = store.get('editorPath', '')
    return {
      success: true,
      path: editorPath
    }
  } catch (error) {
    return {
      success: false,
      message: error.message,
      path: ''
    }
  }
})

// IPC 处理器 - 设置默认编辑器路径
ipcMain.handle('settings:setEditorPath', async (event, { path }) => {
  try {
    store.set('editorPath', path)
    return {
      success: true,
      message: '默认编辑器设置成功',
      path: path
    }
  } catch (error) {
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 选择编辑器应用
ipcMain.handle('dialog:selectEditor', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: '应用程序', extensions: process.platform === 'darwin' ? ['app'] : (process.platform === 'win32' ? ['exe'] : ['']) },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    
    if (!result.canceled && result.filePaths.length > 0) {
      return { 
        success: true, 
        editorPath: result.filePaths[0]
      }
    } else {
      return { 
        success: false, 
        message: '用户取消了编辑器选择' 
      }
    }
  } catch (error) {
    return { 
      success: false, 
      message: error.message 
    }
  }
})

// IPC 处理器 - 获取主题设置
ipcMain.handle('settings:getTheme', async (event) => {
  try {
    const theme = store.get('theme', 'dark') // 默认暗色主题
    return {
      success: true,
      theme: theme
    }
  } catch (error) {
    console.error('获取主题设置失败:', error)
    return {
      success: false,
      theme: 'dark',
      message: error.message
    }
  }
})

// IPC 处理器 - 设置主题
ipcMain.handle('settings:setTheme', async (event, { theme }) => {
  try {
    if (!['dark', 'light'].includes(theme)) {
      throw new Error('无效的主题名称')
    }
    
    store.set('theme', theme)
    console.log(`主题已设置为: ${theme}`)
    
    return {
      success: true,
      message: '主题设置成功',
      theme: theme
    }
  } catch (error) {
    console.error('设置主题失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 获取终端字体大小
ipcMain.handle('settings:getTerminalFontSize', async (event) => {
  try {
    const fontSize = store.get('terminalFontSize', 14) // 默认字体大小为 14
    return {
      success: true,
      fontSize: fontSize
    }
  } catch (error) {
    console.error('获取终端字体大小失败:', error)
    return {
      success: false,
      fontSize: 14,
      message: error.message
    }
  }
})

// IPC 处理器 - 设置终端字体大小
ipcMain.handle('settings:setTerminalFontSize', async (event, { fontSize }) => {
  try {
    // 验证字体大小范围
    const size = parseInt(fontSize)
    if (isNaN(size) || size < 8 || size > 32) {
      throw new Error('字体大小必须在 8-32 之间')
    }
    
    store.set('terminalFontSize', size)
    console.log(`终端字体大小已设置为: ${size}`)
    
    return {
      success: true,
      message: '终端字体大小设置成功',
      fontSize: size
    }
  } catch (error) {
    console.error('设置终端字体大小失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 打开文件夹
ipcMain.handle('system:openFolder', async (event, { folderPath }) => {
  try {
    if (!folderPath) {
      throw new Error('文件夹路径不能为空')
    }
    
    const { shell } = require('electron')
    
    // 使用 shell.openPath 打开文件夹（跨平台）
    const result = await shell.openPath(folderPath)
    
    if (result) {
      // 如果有返回值，说明打开失败
      console.error('打开文件夹失败:', result)
      return {
        success: false,
        message: result
      }
    }
    
    console.log('文件夹已打开:', folderPath)
    return {
      success: true,
      message: '文件夹已打开'
    }
  } catch (error) {
    console.error('打开文件夹失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 压缩文件夹（从文件路径）
ipcMain.handle('system:compressFolder', async (event, { files, folderName }) => {
  try {
    const archiver = require('archiver')
    const os = require('os')
    const path = require('path')
    const fs = require('fs')
    
    // 创建临时目录
    const tempDir = path.join(os.tmpdir(), 'myssh-uploads')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    
    // 生成临时 ZIP 文件路径
    const zipPath = path.join(tempDir, `${folderName}_${Date.now()}.zip`)
    const output = fs.createWriteStream(zipPath)
    const archive = archiver('zip', {
      zlib: { level: 6 } // 压缩级别 (0-9)
    })
    
    return new Promise((resolve, reject) => {
      output.on('close', () => {
        console.log(`压缩完成: ${archive.pointer()} 字节`)
        resolve({
          success: true,
          zipPath: zipPath,
          size: archive.pointer()
        })
      })
      
      archive.on('error', (err) => {
        console.error('压缩失败:', err)
        reject(err)
      })
      
      archive.pipe(output)
      
      // 添加文件到压缩包
      files.forEach((file) => {
        if (file.path) {
          // Electron 环境中的文件对象
          const fileName = file.relativePath || file.name
          archive.file(file.path, { name: fileName })
        } else if (typeof file === 'string') {
          // 文件路径字符串
          const fileName = path.basename(file)
          archive.file(file, { name: fileName })
        }
      })
      
      archive.finalize()
    })
  } catch (error) {
    console.error('压缩文件夹失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 压缩文件夹（从文件数据）
ipcMain.handle('system:compressFolderFromData', async (event, { filesData, folderName }) => {
  try {
    const archiver = require('archiver')
    const os = require('os')
    const path = require('path')
    const fs = require('fs')
    
    console.log(`开始压缩文件夹: ${folderName}，包含 ${filesData.length} 个文件`)
    
    // 创建临时目录
    const tempDir = path.join(os.tmpdir(), 'myssh-uploads')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    
    // 生成临时 ZIP 文件路径
    const zipPath = path.join(tempDir, `${folderName}_${Date.now()}.zip`)
    const output = fs.createWriteStream(zipPath)
    const archive = archiver('zip', {
      zlib: { level: 6 } // 压缩级别 (0-9)
    })
    
    return new Promise((resolve, reject) => {
      output.on('close', () => {
        console.log(`压缩完成: ${archive.pointer()} 字节，保存到: ${zipPath}`)
        resolve({
          success: true,
          zipPath: zipPath,
          size: archive.pointer()
        })
      })
      
      archive.on('error', (err) => {
        console.error('压缩失败:', err)
        reject({
          success: false,
          message: err.message
        })
      })
      
      archive.pipe(output)
      
      // 添加文件到压缩包（从 buffer 数据）
      filesData.forEach((fileData) => {
        const buffer = Buffer.from(fileData.buffer)
        const fileName = fileData.relativePath || fileData.name
        console.log(`  添加文件: ${fileName} (${fileData.size} 字节)`)
        archive.append(buffer, { name: fileName })
      })
      
      archive.finalize()
    })
  } catch (error) {
    console.error('压缩文件夹失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 删除文件
ipcMain.handle('system:deleteFile', async (event, filePath) => {
  try {
    const fs = require('fs')
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      console.log(`已删除临时文件: ${filePath}`)
      return {
        success: true,
        message: '文件已删除'
      }
    }
    
    return {
      success: true,
      message: '文件不存在'
    }
  } catch (error) {
    console.error('删除文件失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 删除文件夹
ipcMain.handle('system:deleteFolder', async (event, folderPath) => {
  try {
    const fs = require('fs')
    
    if (fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, { recursive: true, force: true })
      console.log(`已删除临时文件夹: ${folderPath}`)
      return {
        success: true,
        message: '文件夹已删除'
      }
    }
    
    return {
      success: true,
      message: '文件夹不存在'
    }
  } catch (error) {
    console.error('删除文件夹失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 在文件夹中显示文件
ipcMain.handle('system:showItemInFolder', async (event, filePath) => {
  try {
    const { shell } = require('electron')
    shell.showItemInFolder(filePath)
    return {
      success: true
    }
  } catch (error) {
    console.error('打开文件夹失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 保存文件到临时目录
ipcMain.handle('system:saveFilesToTemp', async (event, { tempDir, filesData }) => {
  try {
    const fs = require('fs')
    const path = require('path')
    
    console.log(`保存 ${filesData.length} 个文件到: ${tempDir}`)
    
    // 创建临时目录
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    
    let successCount = 0
    let skipCount = 0
    const errors = []
    
    // 保存每个文件
    for (const fileData of filesData) {
      try {
        const filePath = path.join(tempDir, fileData.relativePath)
        const fileDir = path.dirname(filePath)
        
        // 跳过特殊文件（如 .asar, .node 等二进制模块）
        const fileName = path.basename(filePath).toLowerCase()
        if (fileName.endsWith('.asar') || 
            fileName.endsWith('.node') || 
            fileName.endsWith('.dylib') ||
            fileName.endsWith('.so') ||
            fileName.endsWith('.dll')) {
          console.log(`  跳过特殊文件: ${fileData.relativePath}`)
          skipCount++
          continue
        }
        
        // 确保目录存在
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true })
        }
        
        // 写入文件（fileData.data 是 Uint8Array）
        const buffer = Buffer.from(fileData.data)
        fs.writeFileSync(filePath, buffer)
        console.log(`  保存: ${fileData.relativePath} (${fileData.size} bytes)`)
        successCount++
      } catch (fileError) {
        // 记录错误但继续处理其他文件
        console.warn(`  保存文件失败: ${fileData.relativePath}`, fileError.message)
        errors.push({
          file: fileData.relativePath,
          error: fileError.message
        })
        skipCount++
      }
    }
    
    console.log(`保存完成: 成功 ${successCount} 个, 跳过 ${skipCount} 个`)
    
    if (successCount === 0) {
      return {
        success: false,
        message: `没有成功保存任何文件。错误: ${errors.map(e => e.error).join(', ')}`
      }
    }
    
    return {
      success: true,
      message: `文件已保存到临时目录 (成功: ${successCount}, 跳过: ${skipCount})`,
      stats: {
        success: successCount,
        skipped: skipCount,
        errors: errors
      }
    }
  } catch (error) {
    console.error('保存文件到临时目录失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 压缩文件夹（从文件夹路径）
ipcMain.handle('system:compressFolderPath', async (event, { folderPath, folderName }) => {
  try {
    const archiver = require('archiver')
    const os = require('os')
    const path = require('path')
    const fs = require('fs')
    
    console.log(`压缩文件夹: ${folderPath} -> ${folderName}.tar.gz`)
    
    // 创建临时目录
    const tempDir = path.join(os.tmpdir(), 'myssh-uploads')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    
    // 生成临时 tar.gz 文件路径（tar 更通用，几乎所有 Linux 都自带）
    const tarPath = path.join(tempDir, `${folderName}_${Date.now()}.tar.gz`)
    const output = fs.createWriteStream(tarPath)
    const archive = archiver('tar', {
      gzip: true,
      gzipOptions: {
        level: 6 // 压缩级别 (0-9)
      }
    })
    
    return new Promise((resolve, reject) => {
      output.on('close', () => {
        console.log(`压缩完成: ${archive.pointer()} 字节`)
        resolve({
          success: true,
          tarPath: tarPath,
          zipPath: tarPath, // 为了兼容性，也提供 zipPath 属性
          size: archive.pointer()
        })
      })
      
      archive.on('error', (err) => {
        console.error('压缩失败:', err)
        reject({
          success: false,
          message: err.message
        })
      })
      
      archive.pipe(output)
      
      // 添加整个文件夹到压缩包
      archive.directory(folderPath, false)
      
      archive.finalize()
    })
  } catch (error) {
    console.error('压缩文件夹失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 创建 PTY Shell（支持交互式命令）
let ptyShells = new Map() // 保存 PTY shell 会话

ipcMain.handle('ssh:create-pty', async (event, { connectionId, cols, rows }) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    return new Promise((resolve, reject) => {
      ssh.connection.shell({
        cols: cols || 80,
        rows: rows || 24,
        term: 'xterm-256color'
      }, (err, stream) => {
        if (err) {
          reject(err)
          return
        }

        // 保存 shell 流
        ptyShells.set(String(connectionId), stream)

        // 监听数据输出
        stream.on('data', (data) => {
          event.sender.send('ssh:pty-data', {
            connectionId,
            data: data.toString('utf-8')
          })
        })

        // 监听关闭事件
        stream.on('close', () => {
          event.sender.send('ssh:pty-close', { connectionId })
          ptyShells.delete(String(connectionId))
        })

        resolve({ success: true, message: 'PTY shell 已创建' })
      })
    })
  } catch (error) {
    console.error('创建 PTY shell 失败:', error)
    return { success: false, message: error.message }
  }
})

// IPC 处理器 - 向 PTY 发送数据
ipcMain.handle('ssh:pty-write', async (event, { connectionId, data }) => {
  try {
    const stream = ptyShells.get(String(connectionId))
    if (!stream) {
      throw new Error('PTY shell 不存在')
    }

    stream.write(data)
    return { success: true }
  } catch (error) {
    console.error('写入 PTY 失败:', error)
    return { success: false, message: error.message }
  }
})

// IPC 处理器 - 调整 PTY 大小
ipcMain.handle('ssh:pty-resize', async (event, { connectionId, cols, rows }) => {
  try {
    const stream = ptyShells.get(String(connectionId))
    if (!stream) {
      throw new Error('PTY shell 不存在')
    }

    stream.setWindow(rows, cols)
    return { success: true }
  } catch (error) {
    console.error('调整 PTY 大小失败:', error)
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

// IPC 处理器 - 用编辑器打开文件
const fs = require('fs')
const { spawn, execFile } = require('child_process')
const watchers = new Map() // 保存文件监听器

ipcMain.handle('editor:openFile', async (event, { filePath }) => {
  try {
    const os = require('os')
    
    // 首先尝试获取用户设置的编辑器
    const customEditor = store.get('editorPath', '')
    
    if (customEditor && fs.existsSync(customEditor)) {
      // 使用自定义编辑器
      console.log('使用自定义编辑器:', customEditor)
      
      const editorName = customEditor.toLowerCase()
      
      // 处理不同的编辑器
      if (editorName.includes('visual studio code') || editorName.includes('code.app') || editorName.includes('code.exe')) {
        // VS Code 特殊处理
        console.log('启动 VS Code:', customEditor)
        
        return new Promise((resolve) => {
          if (process.platform === 'darwin') {
            // macOS: 使用 open 命令启动 VS Code，不创建新窗口
            execFile('open', ['-a', customEditor, filePath], (error) => {
              if (error) {
                console.error('macOS VS Code 打开失败:', error)
                resolve({
                  success: false,
                  message: error.message
                })
              } else {
                console.log('macOS VS Code 打开成功')
                resolve({
                  success: true,
                  message: '编辑器已打开'
                })
              }
            })
          } else if (process.platform === 'win32') {
            // Windows: 尝试使用 code 命令行工具（如果可用）
            // 首先尝试通过 code 命令
            execFile('code', [filePath], (error) => {
              if (error) {
                console.log('通过 code 命令失败，尝试直接执行...')
                // 失败则直接执行 Code.exe
                const codeExe = customEditor
                execFile(codeExe, [filePath], (innerError) => {
                  if (innerError) {
                    console.error('Windows VS Code 打开失败:', innerError)
                    resolve({
                      success: false,
                      message: innerError.message
                    })
                  } else {
                    console.log('Windows VS Code 打开成功')
                    resolve({
                      success: true,
                      message: '编辑器已打开'
                    })
                  }
                })
              } else {
                console.log('Windows VS Code 通过 code 命令打开成功')
                resolve({
                  success: true,
                  message: '编辑器已打开'
                })
              }
            })
          } else {
            // Linux: 使用 code 命令
            execFile('code', [filePath], (error) => {
              if (error) {
                console.error('Linux VS Code 打开失败:', error)
                resolve({
                  success: false,
                  message: error.message
                })
              } else {
                console.log('Linux VS Code 打开成功')
                resolve({
                  success: true,
                  message: '编辑器已打开'
                })
              }
            })
          }
        })
      } else if (editorName.includes('sublime')) {
        // Sublime Text
        console.log('启动 Sublime Text:', customEditor)
        
        return new Promise((resolve) => {
          if (process.platform === 'darwin') {
            execFile('open', ['-a', customEditor, filePath], (error) => {
              if (error) {
                resolve({ success: false, message: error.message })
              } else {
                resolve({ success: true, message: '编辑器已打开' })
              }
            })
          } else {
            execFile(customEditor, [filePath], (error) => {
              if (error) {
                resolve({ success: false, message: error.message })
              } else {
                resolve({ success: true, message: '编辑器已打开' })
              }
            })
          }
        })
      } else if (editorName.includes('atom')) {
        // Atom
        console.log('启动 Atom:', customEditor)
        
        return new Promise((resolve) => {
          if (process.platform === 'darwin') {
            execFile('open', ['-a', customEditor, filePath], (error) => {
              if (error) {
                resolve({ success: false, message: error.message })
              } else {
                resolve({ success: true, message: '编辑器已打开' })
              }
            })
          } else {
            execFile(customEditor, [filePath], (error) => {
              if (error) {
                resolve({ success: false, message: error.message })
              } else {
                resolve({ success: true, message: '编辑器已打开' })
              }
            })
          }
        })
      } else {
        // 其他编辑器，直接尝试打开
        console.log('启动其他编辑器:', customEditor)
        
        return new Promise((resolve) => {
          if (process.platform === 'darwin') {
            execFile('open', ['-a', customEditor, filePath], (error) => {
              if (error) {
                resolve({ success: false, message: error.message })
              } else {
                resolve({ success: true, message: '编辑器已打开' })
              }
            })
          } else {
            execFile(customEditor, [filePath], (error) => {
              if (error) {
                resolve({ success: false, message: error.message })
              } else {
                resolve({ success: true, message: '编辑器已打开' })
              }
            })
          }
        })
      }
    } else {
      // 使用系统默认编辑器
      console.log('使用系统默认编辑器')
      
      return new Promise((resolve) => {
        if (process.platform === 'darwin') {
          // macOS
          execFile('open', ['-a', 'TextEdit', filePath], (error) => {
            if (error) {
              resolve({ success: false, message: error.message })
            } else {
              resolve({ success: true, message: '编辑器已打开' })
            }
          })
        } else if (process.platform === 'win32') {
          // Windows
          execFile('notepad', [filePath], (error) => {
            if (error) {
              resolve({ success: false, message: error.message })
            } else {
              resolve({ success: true, message: '编辑器已打开' })
            }
          })
        } else {
          // Linux
          execFile('gedit', [filePath], (error) => {
            if (error) {
              resolve({ success: false, message: error.message })
            } else {
              resolve({ success: true, message: '编辑器已打开' })
            }
          })
        }
      })
    }
  } catch (error) {
    console.error('打开编辑器失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 获取文件修改时间
ipcMain.handle('file:getModifyTime', async (event, { filePath }) => {
  try {
    const stats = fs.statSync(filePath)
    return {
      success: true,
      modifyTime: stats.mtimeMs // 返回毫秒时间戳
    }
  } catch (error) {
    console.error('获取文件修改时间失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// 文件监听状态存储
const fileWatchStates = new Map()

// IPC 处理器 - 监听文件变化
ipcMain.handle('file:watch', async (event, { filePath }) => {
  try {
    if (!fileWatchStates.has(filePath)) {
      // 首次监听，记录初始修改时间
      const stats = fs.statSync(filePath)
      fileWatchStates.set(filePath, {
        lastModifyTime: stats.mtimeMs
      })
      return {
        success: true,
        changed: false
      }
    } else {
      // 后续监听，检查是否有变化
      const stats = fs.statSync(filePath)
      const state = fileWatchStates.get(filePath)
      const hasChanged = stats.mtimeMs > state.lastModifyTime
      
      if (hasChanged) {
        // 更新最后修改时间
        state.lastModifyTime = stats.mtimeMs
      }
      
      return {
        success: true,
        changed: hasChanged
      }
    }
  } catch (error) {
    console.error('监听文件失败:', error)
    return {
      success: false,
      changed: false,
      message: error.message
    }
  }
})

// 连接配置文件路径
const getConnectionsFilePath = () => {
  // 获取用户自定义的保存路径，如果没有则使用默认的 userData 目录
  let customPath = store.get('connectionsPath', '')
  
  let connectionsDir
  if (customPath && fs.existsSync(customPath)) {
    // 使用用户自定义路径
    connectionsDir = customPath
  } else {
    // 使用默认的 userData 目录（打包后可写）
    const userDataPath = app.getPath('userData')
    connectionsDir = path.join(userDataPath, 'connections')
  }
  
  // 确保目录存在
  if (!fs.existsSync(connectionsDir)) {
    fs.mkdirSync(connectionsDir, { recursive: true })
  }
  
  return path.join(connectionsDir, 'connections.json')
}

// IPC 处理器 - 获取连接文件路径
ipcMain.handle('connections:getPath', async (event) => {
  try {
    const filePath = getConnectionsFilePath()
    return {
      success: true,
      path: filePath
    }
  } catch (error) {
    console.error('获取连接文件路径失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 设置连接文件保存路径
ipcMain.handle('connections:setPath', async (event, { path: newPath }) => {
  try {
    // 验证路径是否存在
    if (!fs.existsSync(newPath)) {
      fs.mkdirSync(newPath, { recursive: true })
    }
    
    // 保存新路径到配置
    store.set('connectionsPath', newPath)
    console.log(`连接文件保存路径已更新为: ${newPath}`)
    
    return {
      success: true,
      message: '保存路径已更新',
      path: newPath
    }
  } catch (error) {
    console.error('设置连接文件保存路径失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 选择连接文件保存路径
ipcMain.handle('connections:selectPath', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择连接配置保存位置',
      buttonLabel: '选择',
      message: '请选择一个文件夹来保存 SSH 连接配置'
    })
    
    if (!result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0]
      
      // 保存选择的路径
      store.set('connectionsPath', selectedPath)
      console.log(`用户选择了连接文件保存路径: ${selectedPath}`)
      
      return {
        success: true,
        path: selectedPath
      }
    } else {
      return {
        success: false,
        message: '用户取消了选择'
      }
    }
  } catch (error) {
    console.error('选择连接文件保存路径失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 检查是否是第一次运行
ipcMain.handle('connections:isFirstRun', async (event) => {
  try {
    const customPath = store.get('connectionsPath', '')
    const isFirstRun = !customPath
    
    return {
      success: true,
      isFirstRun: isFirstRun,
      defaultPath: app.getPath('userData')
    }
  } catch (error) {
    console.error('检查首次运行状态失败:', error)
    return {
      success: false,
      isFirstRun: true,
      message: error.message
    }
  }
})

// IPC 处理器 - 加载连接配置
ipcMain.handle('connections:load', async (event) => {
  try {
    const filePath = getConnectionsFilePath()
    
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8')
      const connections = JSON.parse(data)
      console.log(`已加载 ${connections.length} 个连接配置`)
      return {
        success: true,
        connections: connections
      }
    } else {
      console.log('连接配置文件不存在，返回空列表')
      return {
        success: true,
        connections: []
      }
    }
  } catch (error) {
    console.error('加载连接配置失败:', error)
    return {
      success: false,
      connections: [],
      message: error.message
    }
  }
})

// IPC 处理器 - 保存连接配置
ipcMain.handle('connections:save', async (event, { connections }) => {
  try {
    const filePath = getConnectionsFilePath()
    
    // 确保目录存在
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    
    // 保存连接配置到文件
    fs.writeFileSync(filePath, JSON.stringify(connections, null, 2), 'utf-8')
    console.log(`已保存 ${connections.length} 个连接配置到 ${filePath}`)
    
    return {
      success: true,
      message: '连接配置已保存'
    }
  } catch (error) {
    console.error('保存连接配置失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 获取系统监控数据
ipcMain.handle('ssh:getSystemMonitor', async (event, connectionId) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const monitorData = {
      cpu: null,
      memory: null,
      network: null,
      diskIO: null
    }

    // 获取 CPU 信息
    try {
      // 分开执行命令以确保准确性
      // 1. 获取 CPU 统计
      const cpuStatResult = await ssh.execCommand('cat /proc/stat | head -1')
      // 2. 获取 CPU 核心数（更准确的方法）
      const cpuCoresResult = await ssh.execCommand('grep -c ^processor /proc/cpuinfo')
      // 3. 获取 CPU 型号
      const cpuModelResult = await ssh.execCommand('cat /proc/cpuinfo | grep "model name" | head -1')
      
      if (cpuStatResult.stdout) {
        const cpuLine = cpuStatResult.stdout.trim()
        const cpuMatch = cpuLine.match(/cpu\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/)
        if (cpuMatch) {
          const user = parseInt(cpuMatch[1])
          const nice = parseInt(cpuMatch[2])
          const system = parseInt(cpuMatch[3])
          const idle = parseInt(cpuMatch[4])
          const iowait = parseInt(cpuMatch[5])
          const irq = parseInt(cpuMatch[6])
          const softirq = parseInt(cpuMatch[7])
          
          const total = user + nice + system + idle + iowait + irq + softirq
          const used = total - idle - iowait
          const usage = total > 0 ? (used / total) * 100 : 0
          
          // 获取核心数（使用 grep -c 的结果）
          const processorCount = parseInt(cpuCoresResult.stdout.trim()) || 1
          
          // 获取 CPU 型号
          const modelLine = cpuModelResult.stdout.trim()
          const model = modelLine.split(':')[1]?.trim() || 'Unknown'
          
          monitorData.cpu = {
            usage: usage,
            cores: processorCount,
            model: model
          }
        }
      }
    } catch (error) {
      console.error('获取 CPU 数据失败:', error)
    }

    // 获取内存信息
    try {
      const memResult = await ssh.execCommand('cat /proc/meminfo | grep -E "MemTotal|MemAvailable"')
      if (memResult.stdout) {
        const lines = memResult.stdout.trim().split('\n')
        const totalMatch = lines[0]?.match(/MemTotal:\s+(\d+)/)
        const availMatch = lines[1]?.match(/MemAvailable:\s+(\d+)/)
        
        if (totalMatch && availMatch) {
          const total = parseInt(totalMatch[1]) * 1024 // KB 转 Bytes
          const available = parseInt(availMatch[1]) * 1024
          const used = total - available
          
          monitorData.memory = {
            total: total,
            used: used,
            available: available
          }
        }
      }
    } catch (error) {
      console.error('获取内存数据失败:', error)
    }

    // 获取网络统计（支持多个网卡）
    try {
      const netResult = await ssh.execCommand('cat /proc/net/dev')
      if (netResult.stdout) {
        const lines = netResult.stdout.trim().split('\n')
        const interfaces = {}
        let totalRx = 0
        let totalTx = 0
        
        // 跳过前两行（标题行）
        for (let i = 2; i < lines.length; i++) {
          const line = lines[i].trim()
          // 解析格式: interface: rxBytes ... txBytes
          const match = line.match(/(\w+):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/)
          if (match) {
            const ifaceName = match[1]
            const rxBytes = parseInt(match[2])
            const txBytes = parseInt(match[3])
            
            // 跳过 lo (loopback)
            if (ifaceName !== 'lo') {
              interfaces[ifaceName] = {
                rxBytes: rxBytes,
                txBytes: txBytes
              }
              totalRx += rxBytes
              totalTx += txBytes
            }
          }
        }
        
        monitorData.network = {
          rxBytes: totalRx,
          txBytes: totalTx,
          interfaces: interfaces
        }
      }
    } catch (error) {
      console.error('获取网络数据失败:', error)
    }

    // 获取磁盘 IO 统计
    try {
      const diskResult = await ssh.execCommand('cat /proc/diskstats | grep -E "sda|vda|nvme0n1" | head -1')
      if (diskResult.stdout) {
        // 解析磁盘 IO 统计
        const parts = diskResult.stdout.trim().split(/\s+/)
        if (parts.length >= 14) {
          // 字段: 主设备号 次设备号 设备名 读完成次数 读合并次数 读扇区数 读花费毫秒 写完成次数 写合并次数 写扇区数 写花费毫秒...
          const readSectors = parseInt(parts[5])  // 读扇区数
          const writeSectors = parseInt(parts[9]) // 写扇区数
          const sectorSize = 512 // 扇区大小通常是 512 字节
          
          monitorData.diskIO = {
            readBytes: readSectors * sectorSize,
            writeBytes: writeSectors * sectorSize
          }
        }
      }
    } catch (error) {
      console.error('获取磁盘 IO 数据失败:', error)
    }

    return {
      success: true,
      data: monitorData
    }
  } catch (error) {
    console.error('获取系统监控数据失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 获取进程列表
ipcMain.handle('ssh:getProcessList', async (event, connectionId) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    // 使用 ps 命令获取进程列表，按 CPU 使用率排序
    const psResult = await ssh.execCommand('ps aux --sort=-%cpu | head -50')
    
    if (!psResult.stdout) {
      return {
        success: true,
        processes: []
      }
    }

    const lines = psResult.stdout.trim().split('\n')
    const processes = []
    
    // 获取所有进程的端口信息（包括监听、已建立连接、UDP等所有状态）
    let portsMap = {}
    try {
      // 方法1: 使用 lsof 获取所有网络连接（最全面）
      const lsofResult = await ssh.execCommand('lsof -i -P -n 2>/dev/null')
      if (lsofResult.stdout) {
        const lsofLines = lsofResult.stdout.split('\n')
        lsofLines.forEach(line => {
          // lsof 格式: java    1234 root   5u  IPv6  12345      0t0  TCP *:8080 (LISTEN)
          //          或: nginx   5678 www    6u  IPv4  67890      0t0  TCP 192.168.1.1:80->10.0.0.1:54321 (ESTABLISHED)
          const parts = line.trim().split(/\s+/)
          if (parts.length >= 2 && parts[0] !== 'COMMAND') {
            const pid = parts[1]
            // 查找所有端口号，包括本地端口和远程端口
            for (let i = 0; i < parts.length; i++) {
              // 匹配各种格式: *:8080, 192.168.1.1:80, [::]:8080, 0.0.0.0:3306->10.0.0.1:54321
              const portMatches = parts[i].matchAll(/(?:[*\d.:[\]]+):(\d+)/g)
              for (const match of portMatches) {
                const port = match[1]
                // 过滤掉临时端口（通常大于 32768）
                if (parseInt(port) <= 32768) {
                  if (!portsMap[pid]) {
                    portsMap[pid] = new Set()
                  }
                  portsMap[pid].add(port)
                }
              }
            }
          }
        })
        // 转换 Set 为 Array
        for (const pid in portsMap) {
          portsMap[pid] = Array.from(portsMap[pid])
        }
      }
      
      // 方法2: 如果 lsof 不可用或结果为空，使用 ss 获取所有连接
      if (Object.keys(portsMap).length === 0) {
        const ssResult = await ssh.execCommand('ss -tunap 2>/dev/null')
        if (ssResult.stdout) {
          const ssLines = ssResult.stdout.split('\n')
          ssLines.forEach(line => {
            // ss 格式: tcp   LISTEN 0   128   0.0.0.0:8080   0.0.0.0:*   users:(("java",pid=1234,fd=5))
            //       或: tcp   ESTAB  0   0     192.168.1.1:80  10.0.0.1:54321  users:(("nginx",pid=5678,fd=6))
            const pidMatch = line.match(/pid=(\d+)/)
            if (pidMatch) {
              const pid = pidMatch[1]
              // 提取所有端口号
              const portMatches = line.matchAll(/(?:\d+\.\d+\.\d+\.\d+|::|[\*]):(\d+)/g)
              for (const match of portMatches) {
                const port = match[1]
                if (parseInt(port) <= 32768) {
                  if (!portsMap[pid]) {
                    portsMap[pid] = []
                  }
                  if (!portsMap[pid].includes(port)) {
                    portsMap[pid].push(port)
                  }
                }
              }
            }
          })
        }
      }
      
      // 方法3: 最后尝试 netstat
      if (Object.keys(portsMap).length === 0) {
        const netstatResult = await ssh.execCommand('netstat -tunap 2>/dev/null')
        if (netstatResult.stdout) {
          const netstatLines = netstatResult.stdout.split('\n')
          netstatLines.forEach(line => {
            // netstat 格式: tcp  0  0  0.0.0.0:8080  0.0.0.0:*  LISTEN  1234/java
            //            或: tcp  0  0  192.168.1.1:80  10.0.0.1:54321  ESTABLISHED  5678/nginx
            const parts = line.trim().split(/\s+/)
            if (parts.length >= 7) {
              // PID/程序名在最后一列或倒数第二列
              const pidMatch = parts[parts.length - 1].match(/^(\d+)\//)
              if (pidMatch) {
                const pid = pidMatch[1]
                // 本地地址在第4列
                const localAddr = parts[3]
                const portMatch = localAddr.match(/:(\d+)$/)
                if (portMatch) {
                  const port = portMatch[1]
                  if (parseInt(port) <= 32768) {
                    if (!portsMap[pid]) {
                      portsMap[pid] = []
                    }
                    if (!portsMap[pid].includes(port)) {
                      portsMap[pid].push(port)
                    }
                  }
                }
              }
            }
          })
        }
      }
    } catch (error) {
      console.error('获取端口信息失败:', error)
    }
    
    // 跳过第一行（标题）
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      
      // 解析 ps aux 输出
      // USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
      const parts = line.split(/\s+/)
      if (parts.length >= 11) {
        const user = parts[0]
        const pid = parts[1]
        const cpuStr = parts[2]
        const memPercent = parts[3]
        const vsz = parts[4]
        const rss = parts[5]
        // command 是从第11个字段开始的所有内容
        const command = parts.slice(10).join(' ')
        
        // 简化命令名
        const commandParts = command.split(/\s+/)
        const simpleCommand = commandParts[0].split('/').pop()
        
        // RSS 是以 KB 为单位，转换为 Bytes
        const rssBytes = parseInt(rss) * 1024
        
        // 格式化内存大小
        const formatMemory = (bytes) => {
          if (bytes < 1024 * 1024) {
            return (bytes / 1024).toFixed(1) + 'K'
          } else if (bytes < 1024 * 1024 * 1024) {
            return (bytes / (1024 * 1024)).toFixed(1) + 'M'
          } else {
            return (bytes / (1024 * 1024 * 1024)).toFixed(1) + 'G'
          }
        }
        
        // 获取该进程占用的端口
        const ports = portsMap[pid] || []
        const portsStr = ports.length > 0 ? ports.join(', ') : '-'
        
        processes.push({
          pid: pid,
          user: user,
          cpu: cpuStr,
          cpuNum: parseFloat(cpuStr) || 0,
          memoryPercent: parseFloat(memPercent) || 0,
          memorySize: formatMemory(rssBytes),
          memoryBytes: rssBytes,
          vsz: vsz,
          rss: rss,
          command: simpleCommand,
          fullCommand: command,
          ports: portsStr
        })
      }
    }

    return {
      success: true,
      processes: processes
    }
  } catch (error) {
    console.error('获取进程列表失败:', error)
    return {
      success: false,
      message: error.message,
      processes: []
    }
  }
})

// IPC 处理器 - 获取进程详细信息
ipcMain.handle('ssh:getProcessDetail', async (event, connectionId, pid) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const detail = {
      pid: pid,
      name: '',
      cwd: '',
      env: {}
    }

    // 获取进程名称
    try {
      const nameResult = await ssh.execCommand(`cat /proc/${pid}/comm`)
      if (nameResult.stdout) {
        detail.name = nameResult.stdout.trim()
      }
    } catch (error) {
      console.error('获取进程名称失败:', error)
    }

    // 获取工作目录
    try {
      const cwdResult = await ssh.execCommand(`readlink -f /proc/${pid}/cwd`)
      if (cwdResult.stdout) {
        detail.cwd = cwdResult.stdout.trim()
      }
    } catch (error) {
      console.error('获取工作目录失败:', error)
      detail.cwd = '(无权限或进程已结束)'
    }

    // 获取环境变量
    try {
      const envResult = await ssh.execCommand(`cat /proc/${pid}/environ | tr '\\0' '\\n'`)
      if (envResult.stdout) {
        const envLines = envResult.stdout.trim().split('\n')
        envLines.forEach(line => {
          const index = line.indexOf('=')
          if (index > 0) {
            const key = line.substring(0, index)
            const value = line.substring(index + 1)
            detail.env[key] = value
          }
        })
      }
    } catch (error) {
      console.error('获取环境变量失败:', error)
    }

    return {
      success: true,
      detail: detail
    }
  } catch (error) {
    console.error('获取进程详情失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 终止进程
ipcMain.handle('ssh:killProcess', async (event, connectionId, pid, signal = 'TERM') => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    // 使用 kill 命令终止进程
    const killCmd = signal === 'KILL' ? `kill -9 ${pid}` : `kill ${pid}`
    const result = await ssh.execCommand(killCmd)
    
    // kill 命令成功时通常没有输出
    if (result.code === 0 || !result.stderr) {
      return {
        success: true,
        message: `进程 ${pid} 已被终止`
      }
    } else {
      return {
        success: false,
        message: result.stderr || '终止进程失败'
      }
    }
  } catch (error) {
    console.error('终止进程失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// ==================== Docker 管理相关 IPC 处理器 ====================

// IPC 处理器 - 获取 Docker 信息
ipcMain.handle('ssh:getDockerInfo', async (event, connectionId) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const result = await ssh.execCommand('docker version --format "{{.Server.Version}}"')
    if (result.stdout) {
      return {
        success: true,
        info: {
          version: result.stdout.trim()
        }
      }
    }
    
    return {
      success: false,
      message: 'Docker 未安装或无法访问'
    }
  } catch (error) {
    console.error('获取 Docker 信息失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 获取 Docker 容器列表
ipcMain.handle('ssh:getDockerContainers', async (event, connectionId) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const result = await ssh.execCommand('docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.State}}|{{.Ports}}|{{.CreatedAt}}|{{.Labels}}"')
    
    if (!result.stdout) {
      return {
        success: true,
        containers: []
      }
    }

    const containers = result.stdout.trim().split('\n').map(line => {
      const parts = line.split('|')
      const [id, name, image, state, ports, created, labels] = parts
      
      // 判断是否是 docker-compose 启动的
      const isCompose = labels && (
        labels.includes('com.docker.compose.project') || 
        labels.includes('com.docker.compose.service')
      )
      
      // 提取 compose 项目名称
      let composeProject = null
      if (isCompose && labels) {
        const projectMatch = labels.match(/com\.docker\.compose\.project=([^,]+)/)
        if (projectMatch) {
          composeProject = projectMatch[1]
        }
      }
      
      return {
        id: id.trim(),
        name: name.trim(),
        image: image.trim(),
        state: state.trim().toLowerCase(),
        ports: ports.trim(),
        created: created.trim(),
        isCompose: isCompose,
        composeProject: composeProject,
        labels: labels ? labels.trim() : ''
      }
    })

    return {
      success: true,
      containers: containers
    }
  } catch (error) {
    console.error('获取容器列表失败:', error)
    return {
      success: false,
      message: error.message,
      containers: []
    }
  }
})

// IPC 处理器 - 获取 Docker 镜像列表
ipcMain.handle('ssh:getDockerImages', async (event, connectionId) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const result = await ssh.execCommand('docker images --format "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedAt}}"')
    
    if (!result.stdout) {
      return {
        success: true,
        images: []
      }
    }

    const images = result.stdout.trim().split('\n').map(line => {
      const [id, repository, tag, size, created] = line.split('|')
      return {
        id: id.trim(),
        repository: repository.trim(),
        tag: tag.trim(),
        size: size.trim(),
        created: created.trim()
      }
    })

    return {
      success: true,
      images: images
    }
  } catch (error) {
    console.error('获取镜像列表失败:', error)
    return {
      success: false,
      message: error.message,
      images: []
    }
  }
})

// IPC 处理器 - 获取容器详情
ipcMain.handle('ssh:getDockerContainerDetail', async (event, connectionId, containerId) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const result = await ssh.execCommand(`docker inspect ${containerId}`)
    
    if (result.stdout) {
      const inspectData = JSON.parse(result.stdout)
      if (inspectData && inspectData.length > 0) {
        const container = inspectData[0]
        
        // 提取端口绑定信息
        const portBindings = []
        if (container.NetworkSettings && container.NetworkSettings.Ports) {
          Object.entries(container.NetworkSettings.Ports).forEach(([containerPort, hostBindings]) => {
            if (hostBindings) {
              hostBindings.forEach(binding => {
                const [port, protocol] = containerPort.split('/')
                portBindings.push({
                  containerPort: port,
                  hostPort: binding.HostPort,
                  protocol: protocol || 'tcp'
                })
              })
            }
          })
        }

        return {
          success: true,
          detail: {
            id: container.Id,
            name: container.Name.replace(/^\//, ''),
            image: container.Config.Image,
            state: container.State.Status,
            command: container.Config.Cmd ? container.Config.Cmd.join(' ') : '',
            created: container.Created,
            env: container.Config.Env || [],
            portBindings: portBindings
          }
        }
      }
    }
    
    return {
      success: false,
      message: '获取容器详情失败'
    }
  } catch (error) {
    console.error('获取容器详情失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 获取容器日志
ipcMain.handle('ssh:getDockerContainerLogs', async (event, connectionId, containerId, tail = 200) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    // 使用 2>&1 合并 stdout 和 stderr，确保获取所有日志
    const result = await ssh.execCommand(`docker logs --tail ${tail} ${containerId} 2>&1`)

    // 合并 stdout 和 stderr
    let logs = ''
    if (result.stdout && result.stdout.trim()) {
      logs += result.stdout
    }
    if (result.stderr && result.stderr.trim()) {
      if (logs) logs += '\n'
      logs += result.stderr
    }

    return {
      success: true,
      logs: logs || '暂无日志'
    }
  } catch (error) {
    console.error('获取容器日志失败:', error)
    return {
      success: false,
      message: error.message,
      logs: ''
    }
  }
})

// 存储实时日志流的连接
const dockerLogsStreams = new Map()

// IPC 处理器 - 启动实时日志流
ipcMain.handle('ssh:streamDockerContainerLogs', async (event, connectionId, containerId, tail = 200) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    // 生成流 ID
    const streamId = `${connectionId}-${containerId}`

    // 如果已经有这个容器的流在运行，先关闭它
    if (dockerLogsStreams.has(streamId)) {
      const oldStream = dockerLogsStreams.get(streamId)
      if (oldStream && oldStream.stream) {
        oldStream.stream.end()
        oldStream.stream.close()
      }
    }

    // 首先获取最近的日志
    const result = await ssh.execCommand(`docker logs --tail ${tail} ${containerId} 2>&1`)

    let logs = ''
    if (result.stdout && result.stdout.trim()) {
      logs += result.stdout
    }
    if (result.stderr && result.stderr.trim()) {
      if (logs) logs += '\n'
      logs += result.stderr
    }

    // 启动实时日志流（使用 -f 参数）
    return new Promise((resolve, reject) => {
      ssh.connection.exec(`docker logs -f -n ${tail} ${containerId} 2>&1`, (err, stream) => {
        if (err) {
          console.error('启动日志流失败:', err)
          reject(err)
          return
        }

        // 监听标准输出
        stream.on('data', (data) => {
          const output = data.toString()
          console.log('日志流数据:', output.substring(0, 100))
          // 发送新的日志行到前端
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('docker:logs-stream', {
              streamId: streamId,
              data: output
            })
          }
        })

        // 监听错误输出
        stream.stderr.on('data', (data) => {
          const output = data.toString()
          console.log('日志流错误输出:', output.substring(0, 100))
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('docker:logs-stream', {
              streamId: streamId,
              data: output
            })
          }
        })

        // 流关闭
        stream.on('close', (code, signal) => {
          console.log('日志流已关闭，退出码:', code)
          dockerLogsStreams.delete(streamId)
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('docker:logs-stream-end', {
              streamId: streamId
            })
          }
        })

        // 流错误
        stream.on('error', (error) => {
          console.error('日志流错误:', error)
          dockerLogsStreams.delete(streamId)
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('docker:logs-stream-error', {
              streamId: streamId,
              error: error.message
            })
          }
        })

        // 保存流引用
        dockerLogsStreams.set(streamId, { stream, connectionId })

        resolve({
          success: true,
          logs: logs || '暂无日志',
          streamId: streamId
        })
      })
    })
  } catch (error) {
    console.error('启动实时日志流失败:', error)
    return {
      success: false,
      message: error.message,
      logs: ''
    }
  }
})

// IPC 处理器 - 停止实时日志流
ipcMain.handle('ssh:stopDockerLogsStream', async (event, streamId) => {
  try {
    if (dockerLogsStreams.has(streamId)) {
      const streamObj = dockerLogsStreams.get(streamId)
      if (streamObj && streamObj.stream) {
        streamObj.stream.end()
        streamObj.stream.close()
      }
      dockerLogsStreams.delete(streamId)
    }
    return {
      success: true,
      message: '日志流已停止'
    }
  } catch (error) {
    console.error('停止日志流失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 启动容器
ipcMain.handle('ssh:startDockerContainer', async (event, connectionId, containerId) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const result = await ssh.execCommand(`docker start ${containerId}`)
    
    if (result.code === 0) {
      return {
        success: true,
        message: '容器已启动'
      }
    } else {
      return {
        success: false,
        message: result.stderr || '启动容器失败'
      }
    }
  } catch (error) {
    console.error('启动容器失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 停止容器
ipcMain.handle('ssh:stopDockerContainer', async (event, connectionId, containerId) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const result = await ssh.execCommand(`docker stop ${containerId}`)
    
    if (result.code === 0) {
      return {
        success: true,
        message: '容器已停止'
      }
    } else {
      return {
        success: false,
        message: result.stderr || '停止容器失败'
      }
    }
  } catch (error) {
    console.error('停止容器失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 重启容器
ipcMain.handle('ssh:restartDockerContainer', async (event, connectionId, containerId) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const result = await ssh.execCommand(`docker restart ${containerId}`)
    
    if (result.code === 0) {
      return {
        success: true,
        message: '容器已重启'
      }
    } else {
      return {
        success: false,
        message: result.stderr || '重启容器失败'
      }
    }
  } catch (error) {
    console.error('重启容器失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 删除容器
ipcMain.handle('ssh:removeDockerContainer', async (event, connectionId, containerId) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const result = await ssh.execCommand(`docker rm -f ${containerId}`)
    
    if (result.code === 0) {
      return {
        success: true,
        message: '容器已删除'
      }
    } else {
      return {
        success: false,
        message: result.stderr || '删除容器失败'
      }
    }
  } catch (error) {
    console.error('删除容器失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 删除镜像
ipcMain.handle('ssh:removeDockerImage', async (event, connectionId, imageId) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const result = await ssh.execCommand(`docker rmi ${imageId}`)
    
    if (result.code === 0) {
      return {
        success: true,
        message: '镜像已删除'
      }
    } else {
      return {
        success: false,
        message: result.stderr || '删除镜像失败'
      }
    }
  } catch (error) {
    console.error('删除镜像失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 拉取镜像
ipcMain.handle('ssh:pullDockerImage', async (event, connectionId, imageName) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const result = await ssh.execCommand(`docker pull ${imageName}`)
    
    if (result.code === 0) {
      return {
        success: true,
        message: '镜像拉取成功'
      }
    } else {
      return {
        success: false,
        message: result.stderr || '拉取镜像失败'
      }
    }
  } catch (error) {
    console.error('拉取镜像失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 创建容器
ipcMain.handle('ssh:createDockerContainer', async (event, connectionId, containerConfig) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const { name, image, ports, env, command } = containerConfig
    
    let dockerCmd = `docker run -d --name ${name}`
    
    // 添加端口映射
    if (ports) {
      const portMappings = ports.split(',').map(p => p.trim()).filter(p => p)
      portMappings.forEach(portMap => {
        dockerCmd += ` -p ${portMap}`
      })
    }
    
    // 添加环境变量
    if (env) {
      const envVars = env.split('\n').map(e => e.trim()).filter(e => e)
      envVars.forEach(envVar => {
        dockerCmd += ` -e "${envVar}"`
      })
    }
    
    dockerCmd += ` ${image}`
    
    // 添加自定义命令
    if (command) {
      dockerCmd += ` ${command}`
    }

    const result = await ssh.execCommand(dockerCmd)
    
    if (result.code === 0) {
      return {
        success: true,
        message: '容器创建成功'
      }
    } else {
      return {
        success: false,
        message: result.stderr || '创建容器失败'
      }
    }
  } catch (error) {
    console.error('创建容器失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// ==================== Systemctl 服务管理 ====================

// IPC 处理器 - 获取 systemctl 服务列表
ipcMain.handle('ssh:getSystemctlServices', async (event, connectionId) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    // 使用 systemctl list-units 获取服务列表
    const result = await ssh.execCommand('systemctl list-units --type=service,timer,socket --all --no-pager --plain --no-legend')
    
    if (!result.stdout) {
      return {
        success: true,
        services: []
      }
    }

    const services = []
    const lines = result.stdout.trim().split('\n')
    
    for (const line of lines) {
      if (!line.trim()) continue
      
      // 解析输出格式: UNIT LOAD ACTIVE SUB DESCRIPTION
      const parts = line.trim().split(/\s+/)
      if (parts.length < 4) continue
      
      const unit = parts[0]
      const loadState = parts[1]
      const activeState = parts[2]
      const subState = parts[3]
      const description = parts.slice(4).join(' ')
      
      // 获取服务名（去掉后缀）
      const name = unit.replace(/\.(service|timer|socket)$/, '')
      
      // 检查是否启用了开机自启
      const enabledResult = await ssh.execCommand(`systemctl is-enabled ${unit} 2>/dev/null || echo "disabled"`)
      const enabled = enabledResult.stdout.trim()
      
      services.push({
        name,
        unit,
        description,
        activeState,
        subState,
        enabled,
        loadState
      })
    }

    return {
      success: true,
      services
    }
  } catch (error) {
    console.error('获取服务列表失败:', error)
    return {
      success: false,
      message: error.message,
      services: []
    }
  }
})

// IPC 处理器 - 获取服务状态
ipcMain.handle('ssh:getSystemctlServiceStatus', async (event, connectionId, unit) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const result = await ssh.execCommand(`systemctl status ${unit} --no-pager`)
    
    return {
      success: true,
      status: result.stdout || result.stderr || '无状态信息'
    }
  } catch (error) {
    console.error('获取服务状态失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 获取服务日志
ipcMain.handle('ssh:getSystemctlServiceLogs', async (event, connectionId, unit, lines = 200) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const result = await ssh.execCommand(`journalctl -u ${unit} -n ${lines} --no-pager`)
    
    return {
      success: true,
      logs: result.stdout || '暂无日志'
    }
  } catch (error) {
    console.error('获取服务日志失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 启动服务
ipcMain.handle('ssh:startSystemctlService', async (event, connectionId, unit) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const result = await ssh.execCommand(`sudo systemctl start ${unit}`)
    
    if (result.code === 0) {
      return {
        success: true,
        message: '服务已启动'
      }
    } else {
      return {
        success: false,
        message: result.stderr || '启动服务失败'
      }
    }
  } catch (error) {
    console.error('启动服务失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 停止服务
ipcMain.handle('ssh:stopSystemctlService', async (event, connectionId, unit) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const result = await ssh.execCommand(`sudo systemctl stop ${unit}`)
    
    if (result.code === 0) {
      return {
        success: true,
        message: '服务已停止'
      }
    } else {
      return {
        success: false,
        message: result.stderr || '停止服务失败'
      }
    }
  } catch (error) {
    console.error('停止服务失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 重启服务
ipcMain.handle('ssh:restartSystemctlService', async (event, connectionId, unit) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const result = await ssh.execCommand(`sudo systemctl restart ${unit}`)
    
    if (result.code === 0) {
      return {
        success: true,
        message: '服务已重启'
      }
    } else {
      return {
        success: false,
        message: result.stderr || '重启服务失败'
      }
    }
  } catch (error) {
    console.error('重启服务失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 启用服务（开机自启）
ipcMain.handle('ssh:enableSystemctlService', async (event, connectionId, unit) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const result = await ssh.execCommand(`sudo systemctl enable ${unit}`)
    
    if (result.code === 0 || result.stdout.includes('Created symlink') || result.stderr.includes('Created symlink')) {
      return {
        success: true,
        message: '服务已启用'
      }
    } else {
      return {
        success: false,
        message: result.stderr || '启用服务失败'
      }
    }
  } catch (error) {
    console.error('启用服务失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 禁用服务（取消开机自启）
ipcMain.handle('ssh:disableSystemctlService', async (event, connectionId, unit) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const result = await ssh.execCommand(`sudo systemctl disable ${unit}`)
    
    if (result.code === 0 || result.stdout.includes('Removed') || result.stderr.includes('Removed')) {
      return {
        success: true,
        message: '服务已禁用'
      }
    } else {
      return {
        success: false,
        message: result.stderr || '禁用服务失败'
      }
    }
  } catch (error) {
    console.error('禁用服务失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 获取网络接口列表
ipcMain.handle('ssh:getNetworkInterfaces', async (event, connectionId) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const result = await ssh.execCommand('ls /sys/class/net/ | grep -v lo')
    if (result.stdout) {
      const interfaces = result.stdout.trim().split('\n').filter(iface => iface && iface !== 'lo')
      return {
        success: true,
        interfaces: interfaces
      }
    }
    
    return {
      success: false,
      interfaces: []
    }
  } catch (error) {
    console.error('获取网络接口失败:', error)
    return {
      success: false,
      interfaces: [],
      message: error.message
    }
  }
})

// 存储进程流量的上一次数据（用于计算速率）
const processTrafficCache = new Map()

// IPC 处理器 - 获取网络连接详情（带流量统计）
ipcMain.handle('ssh:getNetworkConnections', async (event, connectionId) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    const connections = []
    const processTraffic = {}
    
    // 首先检查 nethogs 是否可用
    const nethogsCheck = await ssh.execCommand('which nethogs')
    const useNethogs = nethogsCheck.code === 0 && nethogsCheck.stdout.trim().length > 0
    
    console.log('使用 nethogs:', useNethogs)
    
    // 如果使用 nethogs，尝试获取实时网络流量
    if (useNethogs) {
      try {
        // 运行 nethogs 采样 2 秒（需要 root 权限，增加采样时间以获取更准确的数据）
        // -t: tracemode, 表格输出
        // -d: delay，延迟秒数
        const nethogsResult = await ssh.execCommand('timeout 3 sudo nethogs -t -d 2 2>/dev/null || timeout 3 nethogs -t -d 2 2>/dev/null', {
          timeout: 5000 // 设置超时
        })
        
        console.log('🔍 nethogs 原始输出:', nethogsResult.stdout)
        console.log('🔍 nethogs 错误输出:', nethogsResult.stderr)
        
        if (nethogsResult.stdout) {
          const lines = nethogsResult.stdout.trim().split('\n')
          console.log('🔍 nethogs 输出行数:', lines.length)
          
          lines.forEach((line, index) => {
            // 跳过标题行、空行、分隔行
            if (!line.trim() || 
                line.includes('Refreshing') || 
                line.includes('PID') || 
                line.includes('USER') ||
                line.includes('PROGRAM') ||
                line.includes('TOTAL') ||
                line.includes('NetHogs')) {
              return
            }
            
            // nethogs -t 输出格式（表格）:
            // PID USER     PROGRAM                      DEV        SENT      RECEIVED       
            // 1234 root     /usr/sbin/sshd              eth0       0.512       1.024 KB/sec
            // 或者简化版（有些版本）:
            // /usr/sbin/sshd/1234/root    0.512    1.024 KB/sec
            
            // 尝试匹配表格格式: PID USER PROGRAM ... SENT RECEIVED
            let match = line.match(/^\s*(\d+)\s+\S+\s+(\S+)\s+\S+\s+([\d.]+)\s+([\d.]+)/)
            if (match) {
              const pid = match[1]
              const programPath = match[2]
              const processName = programPath.split('/').pop() || 'unknown'
              const sentKB = parseFloat(match[3]) || 0
              const receivedKB = parseFloat(match[4]) || 0
              
              console.log(`  解析到进程 [${pid}] ${processName}: 上传=${sentKB}KB/s, 下载=${receivedKB}KB/s`)
              
              processTraffic[pid] = {
                rxBytes: receivedKB * 1024, // 转换为 bytes/sec
                txBytes: sentKB * 1024,
                timestamp: Date.now(),
                isRealtime: true
              }
            } else {
              // 尝试匹配路径格式: /path/to/program/pid/user  sent  received
              match = line.match(/(\S+)\/(\d+)\/\S+\s+([\d.]+)\s+([\d.]+)/)
              if (match) {
                const programPath = match[1]
                const pid = match[2]
                const processName = programPath.split('/').pop() || 'unknown'
                const sentKB = parseFloat(match[3]) || 0
                const receivedKB = parseFloat(match[4]) || 0
                
                console.log(`  解析到进程 [${pid}] ${processName}: 上传=${sentKB}KB/s, 下载=${receivedKB}KB/s`)
                
                processTraffic[pid] = {
                  rxBytes: receivedKB * 1024,
                  txBytes: sentKB * 1024,
                  timestamp: Date.now(),
                  isRealtime: true
                }
              } else {
                console.log(`  ⚠️ 无法解析第 ${index} 行:`, line)
              }
            }
          })
          
          console.log('✅ nethogs 获取到', Object.keys(processTraffic).length, '个进程的网络流量')
        } else {
          console.log('⚠️ nethogs 没有输出')
        }
      } catch (error) {
        console.error('nethogs 获取失败，回退到 /proc/pid/io:', error)
      }
    }
    
    // 第二步：获取所有网络连接信息
    const ssResult = await ssh.execCommand('ss -tunap 2>/dev/null || netstat -tunap 2>/dev/null')
    
    // 第三步：如果没有使用 nethogs 或 nethogs 失败，则使用 /proc/pid/io
    // 先收集所有唯一的 PID
    const uniquePids = new Set()
    
    if (ssResult.stdout) {
      const lines = ssResult.stdout.split('\n')
      
      // 第一遍：收集所有 PID
      lines.forEach(line => {
        if (!line || line.startsWith('Netid') || line.startsWith('State') || line.startsWith('Proto') || line.startsWith('Active')) {
          return
        }
        
        const ssPidMatch = line.match(/pid=(\d+)/)
        const netstatMatch = line.match(/(\d+)\//)
        const pid = ssPidMatch ? parseInt(ssPidMatch[1]) : (netstatMatch ? parseInt(netstatMatch[1]) : 0)
        
        if (pid > 0) {
          uniquePids.add(pid)
        }
      })
      
      // 批量获取进程的 IO 统计（/proc/<pid>/io）
      // 只在没有 nethogs 数据或 nethogs 数据不完整时才获取
      const pids = Array.from(uniquePids)
      const needsFallback = !useNethogs || Object.keys(processTraffic).length === 0
      
      if (pids.length > 0 && needsFallback) {
        // 限制一次最多处理50个进程，避免命令过长
        const batchSize = 50
        for (let i = 0; i < pids.length; i += batchSize) {
          const batchPids = pids.slice(i, i + batchSize)
          
          // 为每个PID读取 read_bytes 和 write_bytes
          const ioScript = batchPids.map(pid => 
            `if [ -r /proc/${pid}/io ]; then echo -n "${pid} "; grep -E 'read_bytes:|write_bytes:' /proc/${pid}/io 2>/dev/null | awk '{print $2}' | tr '\\n' ' ' | awk '{print $1, $2}'; fi`
          ).join('; ')
          
          try {
            const ioResult = await ssh.execCommand(ioScript)
            
            if (ioResult.stdout) {
              const ioLines = ioResult.stdout.trim().split('\n')
              ioLines.forEach(ioLine => {
                const line = ioLine.trim()
                if (!line) return
                
                // 格式: PID read_bytes write_bytes
                const parts = line.split(/\s+/)
                if (parts.length >= 3) {
                  const pid = parts[0]
                  const readBytes = parseInt(parts[1]) || 0
                  const writeBytes = parseInt(parts[2]) || 0
                  
                  processTraffic[pid] = {
                    rxBytes: readBytes,
                    txBytes: writeBytes,
                    timestamp: Date.now()
                  }
                }
              })
              
              // 调试：输出成功读取的进程数量
              const successCount = Object.keys(processTraffic).length
              console.log(`✅ 成功读取 ${successCount} 个进程的IO数据`)
              if (successCount > 0) {
                // 显示第一个进程的数据作为示例
                const firstPid = Object.keys(processTraffic)[0]
                console.log(`📊 示例数据 (PID ${firstPid}):`, processTraffic[firstPid])
              }
            } else {
              console.log('⚠️ 未能读取进程IO数据，stdout为空')
            }
          } catch (error) {
            console.error('读取进程IO统计失败:', error)
          }
        }
      }
      
      // 第二遍：解析连接信息并关联流量数据
      lines.forEach(line => {
        if (!line || line.startsWith('Netid') || line.startsWith('State') || line.startsWith('Proto') || line.startsWith('Active')) {
          return
        }
        
        try {
          const parts = line.trim().split(/\s+/)
          if (parts.length < 5) return
          
          let protocol, state, localAddr, remoteAddr, processInfo
          
          if (line.includes('users:') || line.includes('LISTEN') || line.includes('ESTAB')) {
            protocol = parts[0]
            state = parts[1] || 'UNKNOWN'
            localAddr = parts[4] || ''
            remoteAddr = parts[5] || ''
            processInfo = parts.slice(6).join(' ')
          } else {
            protocol = parts[0]
            localAddr = parts[3] || ''
            remoteAddr = parts[4] || ''
            state = parts[5] || 'UNKNOWN'
            processInfo = parts[6] || ''
          }
          
          const localMatch = localAddr.match(/^(.+?):(\d+)$/)
          const localIP = localMatch ? localMatch[1] : localAddr
          const localPort = localMatch ? parseInt(localMatch[2]) : 0
          
          const remoteMatch = remoteAddr.match(/^(.+?):(\d+)$/)
          const remoteIP = remoteMatch ? remoteMatch[1] : (remoteAddr === '*' ? '-' : remoteAddr)
          const remotePort = remoteMatch ? parseInt(remoteMatch[2]) : 0
          
          let pid = 0
          let processName = '-'
          
          const ssPidMatch = processInfo.match(/pid=(\d+)/)
          const ssNameMatch = processInfo.match(/\("([^"]+)"/)
          const netstatMatch = processInfo.match(/^(\d+)\/(.+)$/)
          
          if (ssPidMatch) {
            pid = parseInt(ssPidMatch[1])
            processName = ssNameMatch ? ssNameMatch[1] : '-'
          } else if (netstatMatch) {
            pid = parseInt(netstatMatch[1])
            processName = netstatMatch[2]
          }
          
          // 关联流量数据
          let rxBytes = 0
          let txBytes = 0
          let isRealtime = false
          
          if (pid > 0 && processTraffic[pid]) {
            rxBytes = processTraffic[pid].rxBytes
            txBytes = processTraffic[pid].txBytes
            isRealtime = processTraffic[pid].isRealtime || false
          }
          
          connections.push({
            pid: pid,
            processName: processName,
            protocol: protocol.toUpperCase(),
            localAddress: localIP === '*' || localIP === '0.0.0.0' || localIP === '::' ? '0.0.0.0' : localIP,
            localPort: localPort,
            remoteAddress: remoteIP,
            remotePort: remotePort,
            state: state,
            rxBytes: rxBytes,
            txBytes: txBytes,
            isRealtime: isRealtime  // 标记数据来源
          })
        } catch (error) {
          // 解析失败，跳过
        }
      })
    }
    
    // 保存当前数据用于下次计算速率
    processTrafficCache.set(String(connectionId), {
      data: processTraffic,
      timestamp: Date.now()
    })
    
    return {
      success: true,
      connections: connections
    }
  } catch (error) {
    console.error('获取网络连接失败:', error)
    return {
      success: false,
      connections: [],
      message: error.message
    }
  }
})

// IPC 处理器 - 检查 nethogs 是否安装
ipcMain.handle('ssh:checkNethogs', async (event, connectionId) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    // 检查 nethogs 命令是否存在
    const result = await ssh.execCommand('which nethogs')
    const installed = result.code === 0 && result.stdout.trim().length > 0
    
    console.log('nethogs 检查结果:', installed ? '已安装' : '未安装')
    
    return {
      success: true,
      installed: installed
    }
  } catch (error) {
    console.error('检查 nethogs 失败:', error)
    return {
      success: false,
      installed: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 安装 nethogs
ipcMain.handle('ssh:installNethogs', async (event, connectionId) => {
  try {
    const ssh = sshConnections.get(String(connectionId))
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }

    console.log('开始安装 nethogs...')
    
    // 执行安装命令（支持多种包管理器）
    const installCmd = `
      if command -v apt-get >/dev/null 2>&1; then
        apt-get update && apt-get install -y nethogs
      elif command -v yum >/dev/null 2>&1; then
        yum install -y nethogs
      elif command -v dnf >/dev/null 2>&1; then
        dnf install -y nethogs
      elif command -v pacman >/dev/null 2>&1; then
        pacman -Sy --noconfirm nethogs
      else
        echo "不支持的包管理器"
        exit 1
      fi
    `
    
    const result = await ssh.execCommand(installCmd)
    
    if (result.code === 0) {
      console.log('nethogs 安装成功')
      return {
        success: true,
        message: 'nethogs 安装成功'
      }
    } else {
      console.error('nethogs 安装失败:', result.stderr)
      return {
        success: false,
        message: result.stderr || '安装失败'
      }
    }
  } catch (error) {
    console.error('安装 nethogs 失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 获取端口转发列表
ipcMain.handle('ssh:getTunnels', async (event, connectionId) => {
  try {
    const tunnels = activeTunnels.get(String(connectionId))
    
    if (!tunnels || tunnels.length === 0) {
      return {
        success: true,
        tunnels: []
      }
    }
    
    // 返回隧道信息（不包含server对象，避免序列化问题）
    const tunnelList = tunnels.map(({ tunnel }) => ({
      name: tunnel.name,
      type: tunnel.type,
      listenHost: tunnel.listenHost,
      listenPort: tunnel.listenPort,
      targetHost: tunnel.targetHost,
      targetPort: tunnel.targetPort
    }))
    
    console.log(`获取连接 ${connectionId} 的端口转发列表:`, tunnelList)
    
    return {
      success: true,
      tunnels: tunnelList
    }
  } catch (error) {
    console.error('获取端口转发列表失败:', error)
    return {
      success: false,
      tunnels: [],
      message: error.message
    }
  }
})

// IPC 处理器 - 检查端口转发状态
ipcMain.handle('ssh:checkTunnelStatus', async (event, { connectionId, listenHost, listenPort }) => {
  try {
    return new Promise((resolve) => {
      const client = new net.Socket()
      let isConnected = false
      
      // 设置超时时间为3秒
      client.setTimeout(3000)
      
      client.on('connect', () => {
        isConnected = true
        client.destroy()
        resolve({
          success: true,
          isConnected: true
        })
      })
      
      client.on('timeout', () => {
        client.destroy()
        resolve({
          success: true,
          isConnected: false
        })
      })
      
      client.on('error', (err) => {
        resolve({
          success: true,
          isConnected: false,
          error: err.message
        })
      })
      
      // 尝试连接到监听端口
      client.connect(listenPort, listenHost === '0.0.0.0' ? '127.0.0.1' : listenHost)
    })
  } catch (error) {
    console.error('检查端口转发状态失败:', error)
    return {
      success: false,
      isConnected: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 手动建立单个端口转发
ipcMain.handle('ssh:startTunnel', async (event, { connectionId, tunnel }) => {
  try {
    const connId = String(connectionId)
    const ssh = sshConnections.get(connId)
    
    if (!ssh) {
      throw new Error('SSH 连接不存在')
    }
    
    console.log(`🔗 手动建立隧道: ${tunnel.name}`)
    
    // 检查隧道是否已经存在
    const existingTunnels = activeTunnels.get(connId) || []
    const exists = existingTunnels.find(t => 
      t.tunnel.listenPort === tunnel.listenPort && 
      t.tunnel.listenHost === tunnel.listenHost
    )
    
    if (exists) {
      return {
        success: false,
        message: '该端口转发已经在运行中'
      }
    }
    
    // 建立隧道
    await setupTunnel(ssh, connId, tunnel)
    
    console.log(`✅ 隧道 "${tunnel.name}" 已手动建立`)
    
    return {
      success: true,
      message: '端口转发已启动'
    }
  } catch (error) {
    console.error(`手动建立隧道失败:`, error)
    return {
      success: false,
      message: error.message
    }
  }
})

// IPC 处理器 - 手动关闭单个端口转发
ipcMain.handle('ssh:stopTunnel', async (event, { connectionId, listenHost, listenPort }) => {
  try {
    const connId = String(connectionId)
    const tunnels = activeTunnels.get(connId)

    if (!tunnels || tunnels.length === 0) {
      return {
        success: false,
        message: '没有活跃的端口转发'
      }
    }

    // 查找并关闭指定的隧道
    const tunnelIndex = tunnels.findIndex(t =>
      t.tunnel.listenPort === listenPort &&
      t.tunnel.listenHost === listenHost
    )

    if (tunnelIndex === -1) {
      return {
        success: false,
        message: '未找到指定的端口转发'
      }
    }

    const { tunnel, server } = tunnels[tunnelIndex]

    console.log(`🔌 手动关闭隧道: ${tunnel.name} (${listenHost}:${listenPort})`)

    return new Promise((resolve) => {
      if (server) {
        try {
          // 强制关闭所有活跃的 socket 连接
          if (server.sockets && server.sockets.size > 0) {
            console.log(`🔗 关闭 ${server.sockets.size} 个活跃连接`)
            server.sockets.forEach(socket => {
              try {
                socket.destroy()
              } catch (e) {
                console.error('销毁 socket 失败:', e.message)
              }
            })
            server.sockets.clear()
          }

          // 关闭 server 的监听
          server.close(() => {
            console.log(`✅ Server 已关闭: ${tunnel.name}`)
          })

          // 销毁 server
          server.destroy()

          // 立即从列表中移除
          tunnels.splice(tunnelIndex, 1)

          if (tunnels.length === 0) {
            activeTunnels.delete(connId)
          }

          console.log(`✅ 已关闭隧道: ${tunnel.name}`)
          resolve({
            success: true,
            message: '端口转发已关闭'
          })
        } catch (err) {
          console.error(`关闭隧道失败:`, err.message)
          // 即使出错也尝试移除
          tunnels.splice(tunnelIndex, 1)
          if (tunnels.length === 0) {
            activeTunnels.delete(connId)
          }
          resolve({
            success: true,
            message: '端口转发已关闭'
          })
        }
      } else {
        // 远程转发没有server对象，直接移除
        tunnels.splice(tunnelIndex, 1)

        if (tunnels.length === 0) {
          activeTunnels.delete(connId)
        }

        resolve({
          success: true,
          message: '端口转发已关闭'
        })
      }
    })
  } catch (error) {
    console.error(`手动关闭隧道失败:`, error)
    return {
      success: false,
      message: error.message
    }
  }
})
