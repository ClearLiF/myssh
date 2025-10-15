# MySSH - SSH 管理工具

一个基于 Electron + Vue 3 + Element Plus 的现代化 SSH 管理工具，提供左侧菜单导航 + 右侧详情面板的布局设计。

## 🚀 功能特性

### 核心功能
- **SSH 终端**: 支持密码和私钥认证的 SSH 连接
- **SFTP 文件传输**: 安全的文件上传下载管理
- **脚本管理**: 创建、编辑、运行和管理各种脚本
- **系统监控**: 实时监控系统资源使用情况

### 技术特性
- 🖥️ **跨平台**: 基于 Electron，支持 Windows、macOS、Linux
- 🎨 **现代化 UI**: 使用 Element Plus 组件库，界面美观易用
- ⚡ **高性能**: Vue 3 Composition API，响应式设计
- 🔒 **安全性**: 支持 SSH 密钥认证，数据传输加密
- 📱 **响应式**: 自适应布局，支持不同屏幕尺寸

## 🛠️ 技术栈

- **前端框架**: Vue 3 + Composition API
- **UI 组件库**: Element Plus
- **桌面应用**: Electron
- **构建工具**: Vite
- **SSH 库**: node-ssh
- **开发语言**: JavaScript/TypeScript

## 📦 安装和运行

### 环境要求
- Node.js 16.0 或更高版本
- npm 或 yarn 包管理器

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
# 启动 Vite 开发服务器
npm run dev

# 在另一个终端启动 Electron
npm run electron:dev
```

### 构建应用
```bash
# 构建 Vue 应用
npm run build

# 构建 Electron 应用
npm run electron:build
```

## 🏗️ 项目结构

```
myssh/
├── src/                    # Vue 源代码
│   ├── components/        # Vue 组件
│   │   ├── SSHTerminal.vue    # SSH 终端组件
│   │   ├── SFTPManager.vue    # SFTP 文件管理组件
│   │   ├── ScriptManager.vue  # 脚本管理组件
│   │   └── SystemMonitor.vue  # 系统监控组件
│   ├── App.vue            # 主应用组件
│   └── main.js            # Vue 应用入口
├── electron/              # Electron 主进程
│   ├── main.js            # 主进程文件
│   └── preload.js         # 预加载脚本
├── package.json           # 项目配置
├── vite.config.js         # Vite 配置
└── README.md              # 项目说明
```

## 🎯 使用说明

### SSH 连接
1. 在左侧菜单选择 "SSH 终端"
2. 填写连接信息（主机、端口、用户名、密码/私钥）
3. 点击"连接"按钮建立 SSH 连接
4. 在终端中输入命令并执行

### 文件传输
1. 选择 "文件传输" 菜单
2. 配置 SFTP 连接信息
3. 连接成功后可以浏览本地和远程文件
4. 使用拖拽或按钮进行文件上传下载

### 脚本管理
1. 选择 "脚本管理" 菜单
2. 创建新脚本或导入现有脚本
3. 编辑脚本内容并保存
4. 点击"运行"执行脚本

### 系统监控
1. 选择 "系统监控" 菜单
2. 查看实时系统资源使用情况
3. 监控 CPU、内存、磁盘、网络状态
4. 查看进程列表和详细信息

## 🔧 开发指南

### 添加新功能
1. 在 `src/components/` 目录下创建新的 Vue 组件
2. 在 `src/App.vue` 中添加菜单项和组件引用
3. 在 `electron/main.js` 中添加相应的 IPC 处理器
4. 在 `electron/preload.js` 中暴露新的 API

### 自定义样式
- 使用 Element Plus 的主题系统
- 在组件中使用 scoped 样式
- 支持 CSS 变量和主题切换

### 国际化支持
- 项目支持多语言配置
- 可以轻松添加新的语言包

## 🚧 开发计划

### 近期计划
- [ ] 添加连接历史记录
- [ ] 支持多标签页终端
- [ ] 集成代码编辑器
- [ ] 添加连接池管理

### 长期计划
- [ ] 支持 Docker 容器管理
- [ ] 添加数据库管理功能
- [ ] 集成 CI/CD 工具
- [ ] 支持插件系统

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙏 致谢

- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Element Plus](https://element-plus.org/) - Vue 3 组件库
- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [node-ssh](https://github.com/steelbrain/node-ssh) - Node.js SSH 客户端

## 📞 联系方式

如有问题或建议，请通过以下方式联系：

- 提交 GitHub Issue
- 发送邮件至：[your-email@example.com]

---

**注意**: 这是一个开发中的项目，某些功能可能还在开发中。请在生产环境中谨慎使用。
