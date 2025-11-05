<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <h1>MySSH</h1>
        <p>SSH 管理工具</p>
      </div>

      <!-- 登录表单 -->
      <el-form
        v-if="mode === 'login'"
        :model="loginForm"
        :rules="loginRules"
        ref="loginFormRef"
        class="login-form"
        @submit.prevent="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="loginForm.username"
            placeholder="用户名"
            size="large"
            :prefix-icon="User"
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="loginForm.password"
            type="password"
            placeholder="密码"
            size="large"
            :prefix-icon="Lock"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            class="login-button"
            @click="handleLogin"
          >
            登录
          </el-button>
        </el-form-item>

        <div class="form-footer">
          <span>还没有账号？</span>
          <el-link type="primary" @click="mode = 'register'">立即注册</el-link>
        </div>

        <div class="skip-login">
          <el-link type="info" @click="skipLogin">
            <el-icon><Right /></el-icon>
            跳过登录，直接使用本地模式
          </el-link>
        </div>
      </el-form>

      <!-- 注册表单 -->
      <el-form
        v-else
        :model="registerForm"
        :rules="registerRules"
        ref="registerFormRef"
        class="login-form"
        @submit.prevent="handleRegister"
      >
        <el-form-item prop="username">
          <el-input
            v-model="registerForm.username"
            placeholder="用户名"
            size="large"
            :prefix-icon="User"
          />
        </el-form-item>

        <el-form-item prop="email">
          <el-input
            v-model="registerForm.email"
            placeholder="邮箱"
            size="large"
            :prefix-icon="Message"
          />
        </el-form-item>

        <el-form-item prop="phone">
          <el-input
            v-model="registerForm.phone"
            placeholder="手机号"
            size="large"
            :prefix-icon="Message"
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="registerForm.password"
            type="password"
            placeholder="密码"
            size="large"
            :prefix-icon="Lock"
            show-password
          />
        </el-form-item>

        <el-form-item prop="confirmPassword">
          <el-input
            v-model="registerForm.confirmPassword"
            type="password"
            placeholder="确认密码"
            size="large"
            :prefix-icon="Lock"
            show-password
            @keyup.enter="handleRegister"
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            class="login-button"
            @click="handleRegister"
          >
            注册
          </el-button>
        </el-form-item>

        <div class="form-footer">
          <span>已有账号？</span>
          <el-link type="primary" @click="mode = 'login'">立即登录</el-link>
        </div>

        <div class="skip-login">
          <el-link type="info" @click="skipLogin">
            <el-icon><Right /></el-icon>
            跳过登录，直接使用本地模式
          </el-link>
        </div>
      </el-form>

      <!-- API 配置 -->
      <div class="api-config">
        <el-link
          :icon="Setting"
          @click="showApiConfig = true"
        >
          配置 API 地址
        </el-link>
      </div>
    </div>

    <!-- API 配置对话框 -->
    <el-dialog
      v-model="showApiConfig"
      title="API 配置"
      width="600px"
    >
      <el-form label-width="100px">
        <el-form-item label="API 地址">
          <el-input
            v-model="apiBaseURL"
            placeholder="http://localhost:8080"
          />
          <div class="config-tip">
            例如: http://localhost:8080 或 https://api.example.com
          </div>
        </el-form-item>

        <el-divider content-position="left">自定义请求头</el-divider>

        <el-form-item>
          <div class="headers-list">
            <div 
              v-for="(header, index) in customHeaders" 
              :key="index"
              class="header-item"
            >
              <el-input
                v-model="header.key"
                placeholder="请求头名称 (如: X-Custom-Key)"
                style="width: 220px; margin-right: 8px;"
              />
              <el-input
                v-model="header.value"
                placeholder="请求头值"
                style="width: 220px; margin-right: 8px;"
              />
              <el-button 
                type="danger" 
                size="small"
                circle
                @click="removeHeader(index)"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            
            <el-button 
              type="primary" 
              size="small"
              @click="addHeader"
            >
              <el-icon><Plus /></el-icon>
              添加请求头
            </el-button>
          </div>
          <div class="config-tip">
            自定义请求头会添加到所有 API 请求中，常用于特殊认证或跨域配置
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showApiConfig = false">取消</el-button>
        <el-button type="primary" @click="saveApiConfig">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { User, Lock, Message, Setting, Right, Plus, Delete } from '@element-plus/icons-vue'
import { authAPI, apiConfig } from '../services/api'

const emit = defineEmits(['login-success', 'skip-login'])

// 表单模式
const mode = ref('login')
const loading = ref(false)
const showApiConfig = ref(false)
const apiBaseURL = ref('')
const customHeaders = ref([])

// 登录表单
const loginFormRef = ref(null)
const loginForm = ref({
  username: '',
  password: ''
})

const loginRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度在 3 到 20 个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少 6 个字符', trigger: 'blur' }
  ]
}

// 注册表单
const registerFormRef = ref(null)
const registerForm = ref({
  username: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: ''
})

const registerRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 20, message: '用户名长度在 2 到 20 个字符', trigger: 'blur' }
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
  ],
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号格式', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少 6 个字符', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== registerForm.value.password) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

// 处理登录
const handleLogin = async () => {
  if (!loginFormRef.value) return

  try {
    await loginFormRef.value.validate()
    loading.value = true

    const result = await authAPI.login(
      loginForm.value.username,
      loginForm.value.password
    )

    if (result.success) {
      ElMessage.success('登录成功')
      emit('login-success')
    } else {
      ElMessage.error(result.error || '登录失败')
    }
  } catch (error) {
    console.error('登录失败:', error)
  } finally {
    loading.value = false
  }
}

// 处理注册
const handleRegister = async () => {
  if (!registerFormRef.value) return

  try {
    await registerFormRef.value.validate()
    loading.value = true

    const result = await authAPI.register(
      registerForm.value.username,
      registerForm.value.password,
      registerForm.value.email,
      registerForm.value.phone
    )

    if (result.success) {
      ElMessage.success('注册成功，请登录')
      mode.value = 'login'
      // 清空注册表单
      registerForm.value = {
        username: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: ''
      }
    } else {
      ElMessage.error(result.error || '注册失败')
    }
  } catch (error) {
    console.error('注册失败:', error)
  } finally {
    loading.value = false
  }
}

// 添加请求头
const addHeader = () => {
  customHeaders.value.push({ key: '', value: '' })
}

// 移除请求头
const removeHeader = (index) => {
  customHeaders.value.splice(index, 1)
}

// 保存 API 配置
const saveApiConfig = () => {
  if (!apiBaseURL.value) {
    ElMessage.warning('请输入 API 地址')
    return
  }

  // 保存基础地址
  apiConfig.saveBaseURL(apiBaseURL.value)
  
  // 保存自定义请求头
  const headersObj = {}
  customHeaders.value.forEach(header => {
    if (header.key && header.value) {
      headersObj[header.key] = header.value
    }
  })
  apiConfig.saveCustomHeaders(headersObj)
  
  ElMessage.success('API 配置已保存')
  showApiConfig.value = false
}

// 跳过登录
const skipLogin = () => {
  emit('skip-login')
  ElMessage.info('使用本地模式')
}

// 加载 API 配置
const loadApiConfig = () => {
  apiBaseURL.value = apiConfig.baseURL
  
  // 加载自定义请求头
  const headers = apiConfig.customHeaders || {}
  customHeaders.value = Object.entries(headers).map(([key, value]) => ({
    key,
    value
  }))
  
  // 如果没有自定义请求头，添加一个空的提示
  if (customHeaders.value.length === 0) {
    customHeaders.value = []
  }
}

onMounted(() => {
  loadApiConfig()
})
</script>

<style scoped>
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.login-box {
  width: 100%;
  max-width: 420px;
  background: rgba(255, 255, 255, 0.98);
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
}

.login-header {
  text-align: center;
  margin-bottom: 40px;
}

.login-header h1 {
  font-size: 32px;
  font-weight: 700;
  color: #667eea;
  margin: 0 0 8px 0;
}

.login-header p {
  font-size: 14px;
  color: #666;
  margin: 0;
}

.login-form {
  margin-top: 24px;
}

.login-button {
  width: 100%;
  height: 44px;
  font-size: 16px;
  font-weight: 600;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
}

.login-button:hover {
  opacity: 0.9;
}

.form-footer {
  text-align: center;
  margin-top: 16px;
  font-size: 14px;
  color: #666;
}

.form-footer span {
  margin-right: 8px;
}

.api-config {
  text-align: center;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #e0e0e0;
}

.config-tip {
  font-size: 12px;
  color: #999;
  margin-top: 8px;
}

.skip-login {
  text-align: center;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.skip-login .el-link {
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.skip-login .el-link:hover {
  opacity: 0.8;
}

.headers-list {
  width: 100%;
}

.header-item {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

/* 深色模式支持 */
[data-theme="dark"] .login-box {
  background: rgba(30, 30, 30, 0.98);
}

[data-theme="dark"] .login-header h1 {
  color: #8b9bff;
}

[data-theme="dark"] .login-header p {
  color: #aaa;
}

[data-theme="dark"] .form-footer {
  color: #aaa;
}

[data-theme="dark"] .api-config {
  border-top-color: #444;
}
</style>

