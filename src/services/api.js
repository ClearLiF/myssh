// API 配置和请求封装
import { ElMessage } from 'element-plus'

// API 基础配置
class ApiConfig {
  constructor() {
    this.baseURL = this.loadBaseURL()
    this.token = this.loadToken()
    this.userInfo = this.loadUserInfo()
    this.customHeaders = this.loadCustomHeaders()
  }

  // 从 localStorage 加载配置
  loadBaseURL() {
    return localStorage.getItem('api_base_url') || 'http://localhost:8080'
  }

  // 保存 API 基础 URL
  saveBaseURL(url) {
    this.baseURL = url
    localStorage.setItem('api_base_url', url)
  }

  // 加载自定义请求头
  loadCustomHeaders() {
    const headersStr = localStorage.getItem('api_custom_headers')
    if (headersStr) {
      try {
        return JSON.parse(headersStr)
      } catch (error) {
        console.error('解析自定义请求头失败:', error)
        return {}
      }
    }
    return {}
  }

  // 保存自定义请求头
  saveCustomHeaders(headers) {
    this.customHeaders = headers || {}
    localStorage.setItem('api_custom_headers', JSON.stringify(this.customHeaders))
  }

  // 清除自定义请求头
  clearCustomHeaders() {
    this.customHeaders = {}
    localStorage.removeItem('api_custom_headers')
  }

  // 加载 token
  loadToken() {
    return localStorage.getItem('auth_token') || ''
  }

  // 保存 token
  saveToken(token) {
    this.token = token
    localStorage.setItem('auth_token', token)
  }

  // 清除 token
  clearToken() {
    this.token = ''
    localStorage.removeItem('auth_token')
  }

  // 加载用户信息
  loadUserInfo() {
    const userStr = localStorage.getItem('user_info')
    return userStr ? JSON.parse(userStr) : null
  }

  // 保存用户信息
  saveUserInfo(userInfo) {
    this.userInfo = userInfo
    localStorage.setItem('user_info', JSON.stringify(userInfo))
  }

  // 清除用户信息
  clearUserInfo() {
    this.userInfo = null
    localStorage.removeItem('user_info')
  }

  // 获取用户ID
  getUserId() {
    return this.userInfo ? this.userInfo.id : null
  }

  // 清除所有认证信息
  clearAuth() {
    this.clearToken()
    this.clearUserInfo()
  }

  // 检查是否已登录
  isAuthenticated() {
    return !!this.userInfo && !!this.userInfo.id
  }
}

// 创建全局配置实例
const apiConfig = new ApiConfig()

// HTTP 请求封装
class ApiService {
  constructor(config) {
    this.config = config
  }

  // 通用请求方法
  async request(url, options = {}) {
    const {
      method = 'GET',
      headers = {},
      body = null,
      requireAuth = true
    } = options

    // 构建完整 URL
    const fullURL = `${this.config.baseURL}${url}`

    // 构建请求头
    const requestHeaders = {
      'Content-Type': 'application/json',
      ...this.config.customHeaders, // 添加自定义请求头
      ...headers
    }

    // 添加 token
    if (requireAuth && this.config.token) {
      requestHeaders['Authorization'] = `Bearer ${this.config.token}`
    }

    // 构建请求配置
    const requestOptions = {
      method,
      headers: requestHeaders,
      mode: 'cors',
      credentials: 'include' // 携带 cookie 用于 session 认证
    }

    // 添加请求体
    if (body && method !== 'GET') {
      requestOptions.body = JSON.stringify(body)
    }

    try {
      const response = await fetch(fullURL, requestOptions)
      
      // 解析响应
      let data
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        data = await response.json()
      } else {
        data = await response.text()
      }

      // 检查响应状态
      if (!response.ok) {
        // 处理未授权
        if (response.status === 401) {
          this.config.clearAuth()
          ElMessage.error('登录已过期，请重新登录')
          // 触发登录事件
          window.dispatchEvent(new CustomEvent('auth:logout'))
          throw new Error('未授权')
        }

        throw new Error(data.message || `请求失败: ${response.status}`)
      }

      return data
    } catch (error) {
      console.error('API 请求错误:', error)
      throw error
    }
  }

  // GET 请求
  async get(url, options = {}) {
    return this.request(url, { ...options, method: 'GET' })
  }

  // POST 请求
  async post(url, body, options = {}) {
    return this.request(url, { ...options, method: 'POST', body })
  }

  // PUT 请求
  async put(url, body, options = {}) {
    return this.request(url, { ...options, method: 'PUT', body })
  }

  // DELETE 请求
  async delete(url, options = {}) {
    return this.request(url, { ...options, method: 'DELETE' })
  }
}

// 创建 API 服务实例
const apiService = new ApiService(apiConfig)

// 用户认证 API
export const authAPI = {
  // 用户登录
  async login(username, password) {
    try {
      const data = await apiService.post('/sass/sshUser/login', {
        username,
        password
      }, { requireAuth: false })

      // 检查响应格式
      if (data.success && data.queryResult && data.queryResult.list && data.queryResult.list.length > 0) {
        // 保存用户信息（list中只有一个）
        const userInfo = data.queryResult.list[0]
        apiConfig.saveUserInfo(userInfo)
        return { success: true, data: userInfo }
      } else {
        return { success: false, error: data.message || '登录失败' }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  // 用户注册
  async register(username, password, email, phone) {
    try {
      const data = await apiService.post('/sass/sshUser/register', {
        username,
        password,
        email,
        phone
      }, { requireAuth: false })

      if (data.success) {
        return { success: true, data }
      } else {
        return { success: false, error: data.message || '注册失败' }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  // 退出登录
  logout() {
    apiConfig.clearAuth()
    window.dispatchEvent(new CustomEvent('auth:logout'))
  },

  // 获取当前用户信息
  getUserInfo() {
    return apiConfig.userInfo
  },

  // 获取当前用户ID
  getUserId() {
    return apiConfig.getUserId()
  },

  // 检查是否已登录
  isAuthenticated() {
    return apiConfig.isAuthenticated()
  }
}

// SSH 连接列表 API
export const sshListAPI = {
  // 获取 SSH 连接列表
  async getList() {
    try {
      const userId = apiConfig.getUserId()
      if (!userId) {
        return { success: false, error: '未登录或用户ID不存在' }
      }

      const data = await apiService.post('/sass/sshUserConnectList/findList', {
        userId
      })

      if (data.success && data.queryResult && data.queryResult.list) {
        // 将后端字段映射到前端字段
        const mappedList = data.queryResult.list.map(item => ({
          id: item.id,
          userId: item.userId,
          name: item.connectName,
          host: item.ip,
          port: item.port,
          username: item.sshUsername,
          password: item.sshPassword,
          group: item.groupName,
          authType: item.sshMethod || (item.sshPassword ? 'password' : 'privateKey'),
          privateKeyPath: item.sshPrivateKeyUrl,
          createTime: item.createTime,
          updateTime: item.updateTime
        }))
        return { success: true, data: mappedList }
      } else {
        return { success: false, error: data.message || '获取列表失败' }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  // 添加 SSH 连接
  async add(connection) {
    try {
      const userId = apiConfig.getUserId()
      if (!userId) {
        return { success: false, error: '未登录或用户ID不存在' }
      }

      // 将前端字段映射到后端字段
      const payload = {
        userId,
        connectName: connection.name,
        ip: connection.host,
        port: connection.port,
        sshUsername: connection.username,
        sshPassword: connection.password,
        sshMethod: connection.authType || 'password',
        sshPrivateKeyUrl: connection.privateKeyPath || null,
        groupName: connection.group || null
      }

      const data = await apiService.post('/sass/sshUserConnectList/create', payload)
      
      if (data.success) {
        return { success: true, data }
      } else {
        return { success: false, error: data.message || '添加失败' }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  // 更新 SSH 连接
  async update(id, connection) {
    try {
      const userId = apiConfig.getUserId()
      if (!userId) {
        return { success: false, error: '未登录或用户ID不存在' }
      }

      // 将前端字段映射到后端字段
      const payload = {
        id,
        userId,
        connectName: connection.name,
        ip: connection.host,
        port: connection.port,
        sshUsername: connection.username,
        sshPassword: connection.password,
        sshMethod: connection.authType || 'password',
        sshPrivateKeyUrl: connection.privateKeyPath || null,
        groupName: connection.group || null
      }

      const data = await apiService.put('/sass/sshUserConnectList/update', payload)
      
      if (data.success) {
        return { success: true, data }
      } else {
        return { success: false, error: data.message || '更新失败' }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  // 删除 SSH 连接
  async delete(id) {
    try {
      const data = await apiService.delete(`/sass/sshUserConnectList/deleteById/${id}`)
      
      if (data.success) {
        return { success: true, data }
      } else {
        return { success: false, error: data.message || '删除失败' }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
}

// 导出配置和服务
export { apiConfig, apiService }
export default apiService

