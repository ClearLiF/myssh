<template>
  <div class="docker-manager-tab">
    <!-- 工具栏 -->
    <div class="docker-toolbar">
      <div class="toolbar-left">
        <el-icon :size="20"><Box /></el-icon>
        <span class="toolbar-title">Docker 管理</span>
        <el-tag v-if="isConnected" type="success" size="small">
          {{ connection.username }}@{{ connection.host }}
        </el-tag>
        <el-tag v-if="dockerInfo" type="info" size="small">
          版本: {{ dockerInfo.version }}
        </el-tag>
      </div>
      <div class="toolbar-right">
        <el-input
          v-model="searchKeyword"
          size="small"
          placeholder="搜索容器..."
          style="width: 200px"
          clearable
          :prefix-icon="Search"
        />
        <el-button size="small" @click="refreshContainers">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button size="small" @click="autoRefresh = !autoRefresh" :type="autoRefresh ? 'primary' : ''">
          <el-icon><Timer /></el-icon>
          {{ autoRefresh ? '停止' : '自动' }}
        </el-button>
        <el-button size="small" type="primary" @click="showPullImageDialog = true">
          <el-icon><Download /></el-icon>
          拉取镜像
        </el-button>
        <el-button
          size="small"
          :type="showImages ? 'warning' : ''"
          @click="showImages = !showImages"
        >
          <el-icon><Files /></el-icon>
          {{ showImages ? '隐藏镜像' : '镜像管理' }}
        </el-button>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="docker-content">
      <!-- 容器列表 -->
      <div class="containers-section">
        <div class="section-header">
          <div class="section-title">
            <el-icon><List /></el-icon>
            <span>容器列表</span>
            <el-tag size="small" type="info">{{ filteredContainers.length }}</el-tag>
          </div>
          <div style="display: flex; gap: 12px; align-items: center;">
            <el-radio-group v-model="viewMode" size="small">
              <el-radio-button label="list">列表视图</el-radio-button>
              <el-radio-button label="compose">项目分组</el-radio-button>
            </el-radio-group>
            <el-radio-group v-model="containerFilter" size="small">
              <el-radio-button label="all">全部</el-radio-button>
              <el-radio-button label="running">运行中</el-radio-button>
              <el-radio-button label="stopped">已停止</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <!-- 列表视图 -->
        <el-table
          v-if="viewMode === 'list'"
          :data="filteredContainers"
          stripe
          :height="containerTableHeight"
          style="width: 100%"
          class="docker-table"
          @row-click="handleContainerClick"
          @row-contextmenu="handleContainerContextMenu"
          :row-class-name="getContainerRowClassName"
          highlight-current-row
        >
          <el-table-column label="状态" width="80">
            <template #default="scope">
              <el-tag :type="scope.row.state === 'running' ? 'success' : 'info'" size="small">
                {{ scope.row.state === 'running' ? '运行' : '停止' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="100">
            <template #default="scope">
              <el-tag v-if="scope.row.isCompose" type="warning" size="small" effect="plain">
                📦 Compose
              </el-tag>
              <el-tag v-else type="" size="small" effect="plain">
                🐳 Docker
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="名称" width="200" show-overflow-tooltip>
            <template #default="scope">
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <span>{{ scope.row.name }}</span>
                <span v-if="scope.row.composeProject" style="font-size: 11px; color: var(--text-secondary);">
                  项目: {{ scope.row.composeProject }}
                </span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="id" label="ID" width="120" show-overflow-tooltip>
            <template #default="scope">
              <code class="container-id">{{ scope.row.id.substring(0, 12) }}</code>
            </template>
          </el-table-column>
          <el-table-column prop="image" label="镜像" min-width="200" show-overflow-tooltip />
          <el-table-column prop="ports" label="端口" min-width="150" show-overflow-tooltip />
          <el-table-column prop="created" label="创建时间" width="150" show-overflow-tooltip />
          <el-table-column label="操作" width="280" fixed="right">
            <template #default="scope">
              <el-button-group size="small">
                <el-button
                  v-if="scope.row.state === 'running'"
                  size="small"
                  type="warning"
                  @click.stop="stopContainer(scope.row)"
                  :loading="scope.row.stopping"
                  :disabled="scope.row.starting || scope.row.restarting || scope.row.removing"
                >
                  <el-icon :class="{ 'spin-icon': scope.row.stopping }"><VideoPause /></el-icon>
                  {{ scope.row.stopping ? '停止中...' : '停止' }}
                </el-button>
                <el-button
                  v-else
                  size="small"
                  type="success"
                  @click.stop="startContainer(scope.row)"
                  :loading="scope.row.starting"
                  :disabled="scope.row.stopping || scope.row.restarting || scope.row.removing"
                >
                  <el-icon :class="{ 'spin-icon': scope.row.starting }"><VideoPlay /></el-icon>
                  {{ scope.row.starting ? '启动中...' : '启动' }}
                </el-button>
                <el-button
                  size="small"
                  @click.stop="restartContainer(scope.row)"
                  :loading="scope.row.restarting"
                  :disabled="scope.row.starting || scope.row.stopping || scope.row.removing"
                >
                  <el-icon :class="{ 'spin-icon': scope.row.restarting }"><Refresh /></el-icon>
                  {{ scope.row.restarting ? '重启中...' : '重启' }}
                </el-button>
                <el-button
                  size="small"
                  type="danger"
                  @click.stop="removeContainer(scope.row)"
                  :loading="scope.row.removing"
                  :disabled="scope.row.starting || scope.row.stopping || scope.row.restarting"
                >
                  <el-icon :class="{ 'spin-icon': scope.row.removing }"><Delete /></el-icon>
                  {{ scope.row.removing ? '删除中...' : '删除' }}
                </el-button>
              </el-button-group>
            </template>
          </el-table-column>
        </el-table>

        <!-- 项目分组视图 -->
        <div v-else class="compose-projects-view" :style="{ height: containerTableHeight }">
          <!-- Compose 项目列表 -->
          <div v-for="project in composeProjects" :key="project.name" class="compose-project-card">
            <div class="project-header" @click="toggleProject(project.name)">
              <div class="project-header-left">
                <el-icon class="expand-icon" :class="{ expanded: expandedProjects.has(project.name) }">
                  <ArrowRight />
                </el-icon>
                <el-icon :size="20"><Folder /></el-icon>
                <span class="project-name">{{ project.name }}</span>
                <el-tag type="warning" size="small">{{ project.containers.length }} 个容器</el-tag>
                <el-tag
                  :type="project.runningCount > 0 ? 'success' : 'info'"
                  size="small"
                >
                  {{ project.runningCount }} 运行中
                </el-tag>
              </div>
              <div class="project-header-right">
                <el-button
                  size="small"
                  type="success"
                  @click.stop="startAllProjectContainers(project)"
                  :disabled="project.runningCount === project.containers.length"
                >
                  <el-icon><VideoPlay /></el-icon>
                  全部启动
                </el-button>
                <el-button
                  size="small"
                  type="warning"
                  @click.stop="stopAllProjectContainers(project)"
                  :disabled="project.runningCount === 0"
                >
                  <el-icon><VideoPause /></el-icon>
                  全部停止
                </el-button>
              </div>
            </div>

            <!-- 项目下的容器列表 -->
            <transition name="expand">
              <div v-show="expandedProjects.has(project.name)" class="project-containers">
                <div
                  v-for="container in project.containers"
                  :key="container.id"
                  class="container-item"
                  @click="handleContainerClick(container)"
                  @contextmenu.prevent="handleContainerContextMenu(container, null, $event)"
                  :class="{ 'selected': selectedContainer?.id === container.id }"
                >
                  <div class="container-item-left">
                    <el-tag :type="container.state === 'running' ? 'success' : 'info'" size="small">
                      {{ container.state === 'running' ? '运行' : '停止' }}
                    </el-tag>
                    <span class="container-name">{{ container.name }}</span>
                    <code class="container-id-small">{{ container.id.substring(0, 12) }}</code>
                  </div>
                  <div class="container-item-middle">
                    <span class="container-image">{{ container.image }}</span>
                    <span v-if="container.ports" class="container-ports">{{ container.ports }}</span>
                  </div>
                  <div class="container-item-right">
                    <el-button-group size="small">
                      <el-button
                        v-if="container.state === 'running'"
                        size="small"
                        type="warning"
                        @click.stop="stopContainer(container)"
                        :loading="container.stopping"
                        :disabled="container.starting || container.restarting || container.removing"
                        title="停止容器"
                      >
                        <el-icon :class="{ 'spin-icon': container.stopping }"><VideoPause /></el-icon>
                      </el-button>
                      <el-button
                        v-else
                        size="small"
                        type="success"
                        @click.stop="startContainer(container)"
                        :loading="container.starting"
                        :disabled="container.stopping || container.restarting || container.removing"
                        title="启动容器"
                      >
                        <el-icon :class="{ 'spin-icon': container.starting }"><VideoPlay /></el-icon>
                      </el-button>
                      <el-button
                        size="small"
                        @click.stop="restartContainer(container)"
                        :loading="container.restarting"
                        :disabled="container.starting || container.stopping || container.removing"
                        title="重启容器"
                      >
                        <el-icon :class="{ 'spin-icon': container.restarting }"><Refresh /></el-icon>
                      </el-button>
                    </el-button-group>
                  </div>
                </div>
              </div>
            </transition>
          </div>

          <!-- 非 Compose 容器 -->
          <div v-if="standaloneContainers.length > 0" class="compose-project-card">
            <div class="project-header" @click="toggleProject('standalone')">
              <div class="project-header-left">
                <el-icon class="expand-icon" :class="{ expanded: expandedProjects.has('standalone') }">
                  <ArrowRight />
                </el-icon>
                <el-icon :size="20"><Box /></el-icon>
                <span class="project-name">独立容器</span>
                <el-tag type="info" size="small">{{ standaloneContainers.length }} 个容器</el-tag>
              </div>
            </div>

            <transition name="expand">
              <div v-show="expandedProjects.has('standalone')" class="project-containers">
                <div
                  v-for="container in standaloneContainers"
                  :key="container.id"
                  class="container-item"
                  @click="handleContainerClick(container)"
                  @contextmenu.prevent="handleContainerContextMenu(container, null, $event)"
                  :class="{ 'selected': selectedContainer?.id === container.id }"
                >
                  <div class="container-item-left">
                    <el-tag :type="container.state === 'running' ? 'success' : 'info'" size="small">
                      {{ container.state === 'running' ? '运行' : '停止' }}
                    </el-tag>
                    <span class="container-name">{{ container.name }}</span>
                    <code class="container-id-small">{{ container.id.substring(0, 12) }}</code>
                  </div>
                  <div class="container-item-middle">
                    <span class="container-image">{{ container.image }}</span>
                    <span v-if="container.ports" class="container-ports">{{ container.ports }}</span>
                  </div>
                  <div class="container-item-right">
                    <el-button-group size="small">
                      <el-button
                        v-if="container.state === 'running'"
                        size="small"
                        type="warning"
                        @click.stop="stopContainer(container)"
                        :loading="container.stopping"
                        :disabled="container.starting || container.restarting || container.removing"
                        title="停止容器"
                      >
                        <el-icon :class="{ 'spin-icon': container.stopping }"><VideoPause /></el-icon>
                      </el-button>
                      <el-button
                        v-else
                        size="small"
                        type="success"
                        @click.stop="startContainer(container)"
                        :loading="container.starting"
                        :disabled="container.stopping || container.restarting || container.removing"
                        title="启动容器"
                      >
                        <el-icon :class="{ 'spin-icon': container.starting }"><VideoPlay /></el-icon>
                      </el-button>
                      <el-button
                        size="small"
                        @click.stop="restartContainer(container)"
                        :loading="container.restarting"
                        :disabled="container.starting || container.stopping || container.removing"
                        title="重启容器"
                      >
                        <el-icon :class="{ 'spin-icon': container.restarting }"><Refresh /></el-icon>
                      </el-button>
                    </el-button-group>
                  </div>
                </div>
              </div>
            </transition>
          </div>
        </div>
      </div>

      <!-- 镜像列表 -->
      <transition name="slide-down">
        <div v-show="showImages" class="images-section">
        <div class="section-header">
          <div class="section-title">
            <el-icon><Files /></el-icon>
            <span>镜像列表</span>
            <el-tag size="small" type="info">{{ filteredImages.length }}</el-tag>
          </div>
        </div>

        <el-table
          :data="filteredImages"
          stripe
          height="calc(40vh - 120px)"
          style="width: 100%"
          class="docker-table"
          @row-contextmenu="handleImageContextMenu"
          highlight-current-row
        >
          <el-table-column prop="repository" label="仓库" min-width="200" show-overflow-tooltip />
          <el-table-column prop="tag" label="标签" width="120" />
          <el-table-column prop="id" label="ID" width="120" show-overflow-tooltip>
            <template #default="scope">
              <code class="container-id">{{ scope.row.id.substring(0, 12) }}</code>
            </template>
          </el-table-column>
          <el-table-column prop="size" label="大小" width="120" />
          <el-table-column prop="created" label="创建时间" width="150" show-overflow-tooltip />
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="scope">
              <el-button-group size="small">
                <el-button
                  size="small"
                  type="primary"
                  @click.stop="createContainer(scope.row)"
                >
                  <el-icon><Plus /></el-icon>
                  创建容器
                </el-button>
                <el-button
                  size="small"
                  type="danger"
                  @click.stop="removeImage(scope.row)"
                >
                  <el-icon><Delete /></el-icon>
                  删除
                </el-button>
              </el-button-group>
            </template>
          </el-table-column>
        </el-table>
        </div>
      </transition>
    </div>

    <!-- 容器详情下方弹出 -->
    <el-dialog
      v-model="detailDrawerVisible"
      :title="`容器详情 - ${selectedContainer?.name || ''}`"
      width="100%"
      :height="400"
      @close="stopLogsStream"
      class="docker-detail-dialog"
    >
      <div v-if="containerDetail" class="container-detail">
        <el-tabs v-model="activeDetailTab">
          <!-- 基本信息 -->
          <el-tab-pane label="基本信息" name="info">
            <div class="detail-section">
              <div class="detail-item">
                <span class="detail-label">ID:</span>
                <code class="detail-value">{{ containerDetail.id }}</code>
              </div>
              <div class="detail-item">
                <span class="detail-label">名称:</span>
                <span class="detail-value">{{ containerDetail.name }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">类型:</span>
                <el-tag v-if="selectedContainer?.isCompose" type="warning" size="small" effect="plain">
                  📦 Docker Compose
                </el-tag>
                <el-tag v-else type="" size="small" effect="plain">
                  🐳 Docker Run
                </el-tag>
              </div>
              <div v-if="selectedContainer?.composeProject" class="detail-item">
                <span class="detail-label">Compose 项目:</span>
                <el-tag type="warning" size="small">{{ selectedContainer.composeProject }}</el-tag>
              </div>
              <div class="detail-item">
                <span class="detail-label">状态:</span>
                <el-tag :type="containerDetail.state === 'running' ? 'success' : 'info'">
                  {{ containerDetail.state }}
                </el-tag>
              </div>
              <div class="detail-item">
                <span class="detail-label">镜像:</span>
                <span class="detail-value">{{ containerDetail.image }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">命令:</span>
                <code class="detail-value">{{ containerDetail.command }}</code>
              </div>
              <div class="detail-item">
                <span class="detail-label">创建时间:</span>
                <span class="detail-value">{{ containerDetail.created }}</span>
              </div>
            </div>
          </el-tab-pane>

          <!-- 端口映射 -->
          <el-tab-pane label="端口映射" name="ports">
            <div class="detail-section">
              <div v-if="containerDetail.portBindings && containerDetail.portBindings.length > 0">
                <div v-for="(port, index) in containerDetail.portBindings" :key="index" class="port-item">
                  <el-tag type="success">{{ port.hostPort }}</el-tag>
                  <el-icon><Right /></el-icon>
                  <el-tag type="info">{{ port.containerPort }}/{{ port.protocol }}</el-tag>
                </div>
              </div>
              <el-empty v-else description="无端口映射" :image-size="80" />
            </div>
          </el-tab-pane>

          <!-- 环境变量 -->
          <el-tab-pane label="环境变量" name="env">
            <div class="detail-section">
              <div v-if="containerDetail.env && containerDetail.env.length > 0" class="env-container">
                <div v-for="(envVar, index) in containerDetail.env" :key="index" class="env-item">
                  <span class="env-key">{{ envVar.split('=')[0] }}</span>
                  <span class="env-value">{{ envVar.split('=').slice(1).join('=') }}</span>
                </div>
              </div>
              <el-empty v-else description="无环境变量" :image-size="80" />
            </div>
          </el-tab-pane>

          <!-- 日志 -->
          <el-tab-pane label="日志" name="logs">
            <div class="logs-section">
              <div class="logs-toolbar">
                <el-button
                  size="small"
                  @click="loadContainerLogs(selectedContainer)"
                  :loading="logsLoading"
                >
                  <el-icon><Refresh /></el-icon>
                  刷新日志
                </el-button>
                <el-button
                  size="small"
                  :type="logsStreaming ? 'danger' : 'success'"
                  @click="toggleLogsStream"
                >
                  <el-icon><Monitor /></el-icon>
                  {{ logsStreaming ? '停止实时' : '实时日志' }}
                </el-button>
                <el-button size="small" @click="clearLogs">
                  <el-icon><Delete /></el-icon>
                  清空显示
                </el-button>
                <el-tag v-if="containerLogs" size="small" type="info">
                  最近 200 行 {{ logsStreaming ? '(实时)' : '' }}
                </el-tag>
              </div>
              <div class="logs-content" v-loading="logsLoading">
                <pre v-if="containerLogs && containerLogs !== '暂无日志'" class="logs-pre" ref="logsPreRef" v-html="highlightedLogs"></pre>
                <el-empty v-else description="暂无日志" :image-size="80">
                  <el-button
                    type="primary"
                    size="small"
                    @click="loadContainerLogs(selectedContainer)"
                    :loading="logsLoading"
                  >
                    加载日志
                  </el-button>
                </el-empty>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-dialog>

    <!-- 拉取镜像对话框 -->
    <el-dialog v-model="showPullImageDialog" title="拉取 Docker 镜像" width="500px">
      <el-form :model="pullImageForm" label-width="80px">
        <el-form-item label="镜像名称">
          <el-input
            v-model="pullImageForm.imageName"
            placeholder="例如: nginx:latest"
            @keyup.enter="pullImage"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPullImageDialog = false">取消</el-button>
        <el-button type="primary" @click="pullImage" :loading="pulling">拉取</el-button>
      </template>
    </el-dialog>

    <!-- 创建容器对话框 -->
    <el-dialog v-model="showCreateContainerDialog" title="创建容器" width="600px">
      <el-form :model="createContainerForm" label-width="100px">
        <el-form-item label="容器名称">
          <el-input v-model="createContainerForm.name" placeholder="输入容器名称" />
        </el-form-item>
        <el-form-item label="镜像">
          <el-input v-model="createContainerForm.image" disabled />
        </el-form-item>
        <el-form-item label="端口映射">
          <el-input
            v-model="createContainerForm.ports"
            placeholder="例如: 8080:80 或 3306:3306"
          />
        </el-form-item>
        <el-form-item label="环境变量">
          <el-input
            v-model="createContainerForm.env"
            type="textarea"
            :rows="3"
            placeholder="每行一个，例如: KEY=VALUE"
          />
        </el-form-item>
        <el-form-item label="命令">
          <el-input v-model="createContainerForm.command" placeholder="可选，覆盖默认命令" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateContainerDialog = false">取消</el-button>
        <el-button type="primary" @click="executeCreateContainer">创建</el-button>
      </template>
    </el-dialog>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenuVisible"
      class="context-menu"
      :style="{ top: contextMenuPosition.y + 'px', left: contextMenuPosition.x + 'px' }"
      @click.stop
    >
      <template v-if="contextMenuType === 'container'">
        <div class="context-menu-item" @click="copyContainerId">
          <el-icon><DocumentCopy /></el-icon>
          <span>复制容器 ID</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" @click="viewLogs">
          <el-icon><Document /></el-icon>
          <span>查看日志</span>
        </div>
        <div class="context-menu-item" @click="execIntoContainer">
          <el-icon><Monitor /></el-icon>
          <span>进入容器终端</span>
        </div>
      </template>
      <template v-else-if="contextMenuType === 'image'">
        <div class="context-menu-item" @click="copyImageId">
          <el-icon><DocumentCopy /></el-icon>
          <span>复制镜像 ID</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Box, Search, Refresh, Timer, Download, List, Files,
  VideoPause, VideoPlay, Delete, Plus, Right, Document,
  DocumentCopy, Monitor, Close, Folder, ArrowRight
} from '@element-plus/icons-vue'

const props = defineProps({
  connection: {
    type: Object,
    required: true
  },
  connectionId: {
    type: [String, Number],
    required: true
  }
})

// 状态
const isConnected = ref(true)
const containers = ref([])
const images = ref([])
const dockerInfo = ref(null)
const searchKeyword = ref('')
const autoRefresh = ref(true)
const containerFilter = ref('all')
const viewMode = ref('list') // 'list' 或 'compose'
const expandedProjects = ref(new Set()) // 展开的项目
const showImages = ref(false) // 是否显示镜像列表
const selectedContainer = ref(null)
const containerDetail = ref(null)
const containerLogs = ref('')
const detailDrawerVisible = ref(false)
const activeDetailTab = ref('info')
const logsLoading = ref(false)
const logsStreaming = ref(false)
const logsPreRef = ref(null)
let logsStreamId = null
let simulateStreamInterval = null

// 对话框状态
const showPullImageDialog = ref(false)
const showCreateContainerDialog = ref(false)
const pulling = ref(false)

// 表单
const pullImageForm = ref({
  imageName: ''
})
const createContainerForm = ref({
  name: '',
  image: '',
  ports: '',
  env: '',
  command: ''
})

// 右键菜单
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuType = ref('')
const contextMenuItem = ref(null)

// 定时器
let refreshTimer = null

// 过滤后的容器列表
const filteredContainers = computed(() => {
  let result = containers.value

  // 状态过滤
  if (containerFilter.value === 'running') {
    result = result.filter(c => c.state === 'running')
  } else if (containerFilter.value === 'stopped') {
    result = result.filter(c => c.state !== 'running')
  }

  // 搜索过滤
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    result = result.filter(c => {
      return c.name.toLowerCase().includes(keyword) ||
             c.id.toLowerCase().includes(keyword) ||
             c.image.toLowerCase().includes(keyword)
    })
  }

  return result
})

// 过滤后的镜像列表
const filteredImages = computed(() => {
  if (!searchKeyword.value) {
    return images.value
  }

  const keyword = searchKeyword.value.toLowerCase()
  return images.value.filter(img => {
    return img.repository.toLowerCase().includes(keyword) ||
           img.tag.toLowerCase().includes(keyword) ||
           img.id.toLowerCase().includes(keyword)
  })
})

// 日志高亮处理
const highlightedLogs = computed(() => {
  if (!containerLogs.value) return ''

  let html = containerLogs.value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

  // 按行处理，根据日志级别着色整行
  const lines = html.split('\n')
  const coloredLines = lines.map(line => {
    if (line.includes('ERROR') || line.includes('FATAL') || line.includes('Exception')) {
      return `<span class="log-error">${line}</span>`
    } else if (line.includes('WARN') || line.includes('WARNING')) {
      return `<span class="log-warn">${line}</span>`
    } else if (line.includes('INFO')) {
      return `<span class="log-info">${line}</span>`
    } else if (line.includes('DEBUG') || line.includes('TRACE')) {
      return `<span class="log-debug">${line}</span>`
    }
    return line
  })

  return coloredLines.join('\n')
})

// Compose 项目分组
const composeProjects = computed(() => {
  const projects = {}

  filteredContainers.value.forEach(container => {
    if (container.isCompose && container.composeProject) {
      if (!projects[container.composeProject]) {
        projects[container.composeProject] = {
          name: container.composeProject,
          containers: [],
          runningCount: 0
        }
      }
      projects[container.composeProject].containers.push(container)
      if (container.state === 'running') {
        projects[container.composeProject].runningCount++
      }
    }
  })

  return Object.values(projects).sort((a, b) => a.name.localeCompare(b.name))
})

// 独立容器（非 Compose）
const standaloneContainers = computed(() => {
  return filteredContainers.value.filter(c => !c.isCompose)
})

// 容器表格高度（根据是否显示镜像列表动态调整）
const containerTableHeight = computed(() => {
  return showImages.value ? 'calc(60vh - 120px)' : 'calc(100vh - 180px)'
})

// 获取容器行类名
const getContainerRowClassName = ({ row }) => {
  return selectedContainer.value && selectedContainer.value.id === row.id ? 'selected-row' : ''
}

// 切换项目展开/折叠
const toggleProject = (projectName) => {
  if (expandedProjects.value.has(projectName)) {
    expandedProjects.value.delete(projectName)
  } else {
    expandedProjects.value.add(projectName)
  }
  // 触发响应式更新
  expandedProjects.value = new Set(expandedProjects.value)
}

// 启动项目下所有容器
const startAllProjectContainers = async (project) => {
  try {
    await ElMessageBox.confirm(
      `确定要启动项目 ${project.name} 的所有容器吗？`,
      '批量启动',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'info'
      }
    )

    const stoppedContainers = project.containers.filter(c => c.state !== 'running')
    for (const container of stoppedContainers) {
      await startContainer(container)
    }

    ElMessage.success(`项目 ${project.name} 的容器已全部启动`)
  } catch (error) {
    if (error !== 'cancel') {
      console.error('批量启动失败:', error)
    }
  }
}

// 停止项目下所有容器
const stopAllProjectContainers = async (project) => {
  try {
    await ElMessageBox.confirm(
      `确定要停止项目 ${project.name} 的所有容器吗？`,
      '批量停止',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const runningContainers = project.containers.filter(c => c.state === 'running')
    for (const container of runningContainers) {
      await stopContainer(container)
    }

    ElMessage.success(`项目 ${project.name} 的容器已全部停止`)
  } catch (error) {
    if (error !== 'cancel') {
      console.error('批量停止失败:', error)
    }
  }
}

// 处理容器行点击
const handleContainerClick = async (row) => {
  selectedContainer.value = row
  containerDetail.value = null
  containerLogs.value = ''
  await loadContainerDetail(row)
  detailDrawerVisible.value = true
}

// 处理容器右键菜单
const handleContainerContextMenu = (row, column, event) => {
  event.preventDefault()
  contextMenuType.value = 'container'
  contextMenuItem.value = row
  contextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY
  }
  contextMenuVisible.value = true
}

// 处理镜像右键菜单
const handleImageContextMenu = (row, column, event) => {
  event.preventDefault()
  contextMenuType.value = 'image'
  contextMenuItem.value = row
  contextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY
  }
  contextMenuVisible.value = true
}

// 复制容器 ID
const copyContainerId = async () => {
  if (contextMenuItem.value) {
    try {
      await navigator.clipboard.writeText(contextMenuItem.value.id)
      ElMessage.success('已复制容器 ID')
    } catch (error) {
      ElMessage.error('复制失败')
    }
  }
  contextMenuVisible.value = false
}

// 复制镜像 ID
const copyImageId = async () => {
  if (contextMenuItem.value) {
    try {
      await navigator.clipboard.writeText(contextMenuItem.value.id)
      ElMessage.success('已复制镜像 ID')
    } catch (error) {
      ElMessage.error('复制失败')
    }
  }
  contextMenuVisible.value = false
}

// 查看日志
const viewLogs = () => {
  if (contextMenuItem.value) {
    selectedContainer.value = contextMenuItem.value
    loadContainerDetail(contextMenuItem.value)
    activeDetailTab.value = 'logs'
    detailDrawerVisible.value = true
  }
  contextMenuVisible.value = false
}

// 进入容器终端
const execIntoContainer = async () => {
  const container = contextMenuItem.value
  contextMenuVisible.value = false

  if (!container) return

  ElMessage.info('该功能将在新版本中实现')
}

// 点击其他地方关闭右键菜单
const handleClickOutside = () => {
  contextMenuVisible.value = false
}

// 加载 Docker 信息
const loadDockerInfo = async () => {
  if (!window.electronAPI || !props.connectionId) {
    dockerInfo.value = { version: '20.10.17' }
    return
  }

  try {
    const result = await window.electronAPI.ssh.getDockerInfo(props.connectionId)
    if (result.success && result.info) {
      dockerInfo.value = result.info
    }
  } catch (error) {
    console.error('获取 Docker 信息失败:', error)
  }
}

// 刷新容器列表
const refreshContainers = async () => {
  if (!window.electronAPI || !props.connectionId) {
    // 模拟数据
    containers.value = [
      {
        id: 'a1b2c3d4e5f6',
        name: 'nginx-web',
        image: 'nginx:latest',
        state: 'running',
        ports: '80->80/tcp, 443->443/tcp',
        created: '2 hours ago',
        isCompose: false,
        composeProject: null,
        starting: false,
        stopping: false,
        restarting: false,
        removing: false
      },
      {
        id: 'f6e5d4c3b2a1',
        name: 'myapp-mysql-1',
        image: 'mysql:8.0',
        state: 'running',
        ports: '3306->3306/tcp',
        created: '1 day ago',
        isCompose: true,
        composeProject: 'myapp',
        starting: false,
        stopping: false,
        restarting: false,
        removing: false
      },
      {
        id: '123456789abc',
        name: 'myapp-redis-1',
        image: 'redis:alpine',
        state: 'exited',
        ports: '',
        created: '3 days ago',
        isCompose: true,
        composeProject: 'myapp',
        starting: false,
        stopping: false,
        restarting: false,
        removing: false
      }
    ]
    return
  }

  try {
    const result = await window.electronAPI.ssh.getDockerContainers(props.connectionId)
    if (result.success && result.containers) {
      containers.value = result.containers.map(c => ({
        ...c,
        starting: false,
        stopping: false,
        restarting: false,
        removing: false
      }))
    } else {
      ElMessage.error('获取容器列表失败: ' + (result.message || '未知错误'))
    }
  } catch (error) {
    console.error('获取容器列表失败:', error)
    ElMessage.error('获取容器列表失败: ' + error.message)
  }
}

// 刷新镜像列表
const refreshImages = async () => {
  if (!window.electronAPI || !props.connectionId) {
    // 模拟数据
    images.value = [
      {
        id: 'sha256:abcdef123456',
        repository: 'nginx',
        tag: 'latest',
        size: '142 MB',
        created: '2 weeks ago'
      },
      {
        id: 'sha256:fedcba654321',
        repository: 'mysql',
        tag: '8.0',
        size: '521 MB',
        created: '1 month ago'
      },
      {
        id: 'sha256:111222333444',
        repository: 'redis',
        tag: 'alpine',
        size: '32 MB',
        created: '2 months ago'
      }
    ]
    return
  }

  try {
    const result = await window.electronAPI.ssh.getDockerImages(props.connectionId)
    if (result.success && result.images) {
      images.value = result.images
    } else {
      ElMessage.error('获取镜像列表失败: ' + (result.message || '未知错误'))
    }
  } catch (error) {
    console.error('获取镜像列表失败:', error)
    ElMessage.error('获取镜像列表失败: ' + error.message)
  }
}

// 加载容器详情
const loadContainerDetail = async (container) => {
  if (!window.electronAPI || !props.connectionId) {
    // 模拟数据
    containerDetail.value = {
      id: container.id,
      name: container.name,
      image: container.image,
      state: container.state,
      command: '/docker-entrypoint.sh nginx -g "daemon off;"',
      created: container.created,
      portBindings: [
        { hostPort: '80', containerPort: '80', protocol: 'tcp' },
        { hostPort: '443', containerPort: '443', protocol: 'tcp' }
      ],
      env: [
        'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        'NGINX_VERSION=1.23.1',
        'NJS_VERSION=0.7.6'
      ]
    }
    return
  }

  try {
    const result = await window.electronAPI.ssh.getDockerContainerDetail(props.connectionId, container.id)
    if (result.success && result.detail) {
      containerDetail.value = result.detail
    } else {
      ElMessage.error('获取容器详情失败: ' + (result.message || '未知错误'))
    }
  } catch (error) {
    console.error('获取容器详情失败:', error)
    ElMessage.error('获取容器详情失败: ' + error.message)
  }
}

// 加载容器日志（最近 200 条）
const loadContainerLogs = async (container) => {
  if (!container) return

  logsLoading.value = true

  try {
    if (!window.electronAPI || !props.connectionId) {
      // 模拟数据
      await new Promise(resolve => setTimeout(resolve, 500))
      containerLogs.value = `[2024-01-01 10:00:00] Container started
[2024-01-01 10:00:01] Nginx started successfully
[2024-01-01 10:00:02] Listening on port 80
[2024-01-01 10:00:03] Server is ready to accept connections
[2024-01-01 10:00:05] GET /api/health 200 OK
[2024-01-01 10:00:10] Connected to database successfully`
      return
    }

    const result = await window.electronAPI.ssh.getDockerContainerLogs(props.connectionId, container.id, 200)
    if (result.success) {
      containerLogs.value = result.logs || '暂无日志'
    } else {
      ElMessage.error('获取容器日志失败: ' + (result.message || '未知错误'))
      containerLogs.value = ''
    }
  } catch (error) {
    console.error('获取容器日志失败:', error)
    ElMessage.error('获取容器日志失败: ' + error.message)
    containerLogs.value = ''
  } finally {
    logsLoading.value = false
  }
}

// 清空日志显示
const clearLogs = () => {
  containerLogs.value = ''
}

// 切换实时日志流
const toggleLogsStream = async () => {
  if (logsStreaming.value) {
    stopLogsStream()
  } else {
    startLogsStream()
  }
}

// 启动实时日志流
const startLogsStream = async () => {
  if (!selectedContainer.value) return

  logsStreaming.value = true

  try {
    if (!window.electronAPI || !props.connectionId) {
      // 演示模式：模拟实时日志
      let lineCount = 0
      simulateStreamInterval = setInterval(() => {
        if (!logsStreaming.value) {
          clearInterval(simulateStreamInterval)
          simulateStreamInterval = null
          return
        }
        const timestamp = new Date().toLocaleTimeString()
        containerLogs.value += `\n[${timestamp}] 模拟日志行 ${++lineCount}`
        // 自动滚动到底部
        nextTick(() => {
          if (logsPreRef.value) {
            logsPreRef.value.scrollTop = logsPreRef.value.scrollHeight
          }
        })
      }, 1000)
      return
    }

    const result = await window.electronAPI.ssh.streamDockerContainerLogs(
      props.connectionId,
      selectedContainer.value.id,
      200
    )

    if (result.success) {
      containerLogs.value = result.logs || ''
      logsStreamId = result.streamId

      // 监听日志流数据
      window.electronAPI.ssh.onLogsStream((data) => {
        if (data.streamId === logsStreamId && logsStreaming.value) {
          containerLogs.value += data.data
          // 自动滚动到底部
          nextTick(() => {
            if (logsPreRef.value) {
              logsPreRef.value.scrollTop = logsPreRef.value.scrollHeight
            }
          })
        }
      })

      // 监听日志流结束
      window.electronAPI.ssh.onLogsStreamEnd((data) => {
        if (data.streamId === logsStreamId) {
          console.log('日志流已结束')
        }
      })

      // 监听日志流错误
      window.electronAPI.ssh.onLogsStreamError((data) => {
        if (data.streamId === logsStreamId) {
          console.error('日志流错误:', data.error)
          ElMessage.error('日志流错误: ' + data.error)
          logsStreaming.value = false
        }
      })

      // 自动滚动到底部
      nextTick(() => {
        if (logsPreRef.value) {
          logsPreRef.value.scrollTop = logsPreRef.value.scrollHeight
        }
      })
    } else {
      ElMessage.error('启动实时日志失败: ' + (result.message || '未知错误'))
      logsStreaming.value = false
    }
  } catch (error) {
    console.error('启动实时日志失败:', error)
    ElMessage.error('启动实时日志失败: ' + error.message)
    logsStreaming.value = false
  }
}

// 停止实时日志流
const stopLogsStream = async () => {
  logsStreaming.value = false

  // 清理演示模式的定时器
  if (simulateStreamInterval) {
    clearInterval(simulateStreamInterval)
    simulateStreamInterval = null
  }

  // 停止后端的日志流
  if (logsStreamId && window.electronAPI) {
    try {
      await window.electronAPI.ssh.stopDockerLogsStream(logsStreamId)
      logsStreamId = null
    } catch (error) {
      console.error('停止日志流失败:', error)
    }
  }

  // 移除监听器
  if (window.electronAPI) {
    window.electronAPI.ssh.removeLogsStreamListener()
    window.electronAPI.ssh.removeLogsStreamEndListener()
    window.electronAPI.ssh.removeLogsStreamErrorListener()
  }
}

// 启动容器
const startContainer = async (container) => {
  container.starting = true

  try {
    if (!window.electronAPI || !props.connectionId) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      ElMessage.success('演示模式：容器已启动')
      container.state = 'running'
      return
    }

    const result = await window.electronAPI.ssh.startDockerContainer(props.connectionId, container.id)
    if (result.success) {
      ElMessage.success('容器已启动')
      container.state = 'running'
      await refreshContainers()
    } else {
      ElMessage.error('启动容器失败: ' + (result.message || '未知错误'))
    }
  } catch (error) {
    console.error('启动容器失败:', error)
    ElMessage.error('启动容器失败: ' + error.message)
  } finally {
    container.starting = false
  }
}

// 停止容器
const stopContainer = async (container) => {
  container.stopping = true

  try {
    if (!window.electronAPI || !props.connectionId) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      ElMessage.success('演示模式：容器已停止')
      container.state = 'exited'
      return
    }

    const result = await window.electronAPI.ssh.stopDockerContainer(props.connectionId, container.id)
    if (result.success) {
      ElMessage.success('容器已停止')
      container.state = 'exited'
      await refreshContainers()
    } else {
      ElMessage.error('停止容器失败: ' + (result.message || '未知错误'))
    }
  } catch (error) {
    console.error('停止容器失败:', error)
    ElMessage.error('停止容器失败: ' + error.message)
  } finally {
    container.stopping = false
  }
}

// 重启容器
const restartContainer = async (container) => {
  container.restarting = true

  try {
    if (!window.electronAPI || !props.connectionId) {
      await new Promise(resolve => setTimeout(resolve, 1500))
      ElMessage.success('演示模式：容器已重启')
      return
    }

    const result = await window.electronAPI.ssh.restartDockerContainer(props.connectionId, container.id)
    if (result.success) {
      ElMessage.success('容器已重启')
      container.state = 'running'
      await refreshContainers()
    } else {
      ElMessage.error('重启容器失败: ' + (result.message || '未知错误'))
    }
  } catch (error) {
    console.error('重启容器失败:', error)
    ElMessage.error('重启容器失败: ' + error.message)
  } finally {
    container.restarting = false
  }
}

// 删除容器
const removeContainer = async (container) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除容器 ${container.name} 吗？此操作不可恢复！`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    container.removing = true

    if (!window.electronAPI || !props.connectionId) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      ElMessage.success('演示模式：容器已删除')
      containers.value = containers.value.filter(c => c.id !== container.id)
      return
    }

    const result = await window.electronAPI.ssh.removeDockerContainer(props.connectionId, container.id)
    if (result.success) {
      ElMessage.success('容器已删除')
      await refreshContainers()
    } else {
      ElMessage.error('删除容器失败: ' + (result.message || '未知错误'))
      container.removing = false
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除容器失败:', error)
      ElMessage.error('删除容器失败: ' + error.message)
    }
    container.removing = false
  }
}

// 删除镜像
const removeImage = async (image) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除镜像 ${image.repository}:${image.tag} 吗？`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    if (!window.electronAPI || !props.connectionId) {
      ElMessage.success('演示模式：镜像已删除')
      images.value = images.value.filter(img => img.id !== image.id)
      return
    }

    const result = await window.electronAPI.ssh.removeDockerImage(props.connectionId, image.id)
    if (result.success) {
      ElMessage.success('镜像已删除')
      await refreshImages()
    } else {
      ElMessage.error('删除镜像失败: ' + (result.message || '未知错误'))
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除镜像失败:', error)
      ElMessage.error('删除镜像失败: ' + error.message)
    }
  }
}

// 拉取镜像
const pullImage = async () => {
  if (!pullImageForm.value.imageName.trim()) {
    ElMessage.warning('请输入镜像名称')
    return
  }

  if (!window.electronAPI || !props.connectionId) {
    ElMessage.success('演示模式：镜像拉取成功')
    showPullImageDialog.value = false
    pullImageForm.value.imageName = ''
    return
  }

  try {
    pulling.value = true
    const result = await window.electronAPI.ssh.pullDockerImage(
      props.connectionId,
      pullImageForm.value.imageName
    )

    if (result.success) {
      ElMessage.success('镜像拉取成功')
      showPullImageDialog.value = false
      pullImageForm.value.imageName = ''
      await refreshImages()
    } else {
      ElMessage.error('拉取镜像失败: ' + (result.message || '未知错误'))
    }
  } catch (error) {
    console.error('拉取镜像失败:', error)
    ElMessage.error('拉取镜像失败: ' + error.message)
  } finally {
    pulling.value = false
  }
}

// 创建容器
const createContainer = (image) => {
  createContainerForm.value = {
    name: '',
    image: `${image.repository}:${image.tag}`,
    ports: '',
    env: '',
    command: ''
  }
  showCreateContainerDialog.value = true
}

// 执行创建容器
const executeCreateContainer = async () => {
  if (!createContainerForm.value.name.trim()) {
    ElMessage.warning('请输入容器名称')
    return
  }

  if (!window.electronAPI || !props.connectionId) {
    ElMessage.success('演示模式：容器创建成功')
    showCreateContainerDialog.value = false
    return
  }

  try {
    const result = await window.electronAPI.ssh.createDockerContainer(
      props.connectionId,
      createContainerForm.value
    )

    if (result.success) {
      ElMessage.success('容器创建成功')
      showCreateContainerDialog.value = false
      await refreshContainers()
    } else {
      ElMessage.error('创建容器失败: ' + (result.message || '未知错误'))
    }
  } catch (error) {
    console.error('创建容器失败:', error)
    ElMessage.error('创建容器失败: ' + error.message)
  }
}

// 监听自动刷新状态
watch(autoRefresh, (newVal) => {
  if (newVal) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
})

// 监听详情 Tab 切换，自动加载日志
watch(activeDetailTab, (newTab) => {
  if (newTab === 'logs' && selectedContainer.value && !containerLogs.value) {
    loadContainerLogs(selectedContainer.value)
  }
})

// 监听详情窗口关闭，停止日志流
watch(detailDrawerVisible, (newVal) => {
  if (!newVal) {
    stopLogsStream()
  }
})

// 启动自动刷新
const startAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
  refreshTimer = setInterval(() => {
    refreshContainers()
    refreshImages()
  }, 5000) // 每 5 秒刷新一次
}

// 停止自动刷新
const stopAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

// 组件挂载
onMounted(() => {
  loadDockerInfo()
  refreshContainers()
  refreshImages()
  if (autoRefresh.value) {
    startAutoRefresh()
  }
  document.addEventListener('click', handleClickOutside)
})

// 组件卸载
onUnmounted(() => {
  stopAutoRefresh()
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.docker-manager-tab {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  transition: background-color 0.3s ease;
}

.docker-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

.docker-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.containers-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border-radius: 8px;
  overflow: hidden;
  min-height: 0;
}

.images-section {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border-radius: 8px;
  overflow: hidden;
  min-height: 0;
  max-height: 40vh;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.docker-table {
  background: var(--bg-primary) !important;
}

.docker-table :deep(.el-table__header) {
  background: var(--bg-secondary) !important;
}

.docker-table :deep(.el-table__header th) {
  background: var(--bg-secondary) !important;
  color: var(--text-primary) !important;
  font-weight: 600;
}

.docker-table :deep(.el-table__row) {
  background: var(--card-bg) !important;
  transition: background-color 0.3s ease;
  cursor: pointer;
}

.docker-table :deep(.el-table__row:hover) {
  background: var(--hover-bg) !important;
}

.docker-table :deep(.el-table__row.el-table__row--striped) {
  background: var(--bg-secondary) !important;
}

.docker-table :deep(.el-table__row.el-table__row--striped:hover) {
  background: var(--hover-bg) !important;
}

.docker-table :deep(td) {
  color: var(--text-primary) !important;
  border-color: var(--border-color-light) !important;
}

.container-id {
  font-family: 'Cascadia Code', 'JetBrains Mono', monospace;
  font-size: 12px;
  padding: 2px 6px;
  background: rgba(102, 126, 234, 0.1);
  border-radius: 4px;
  color: #667eea;
}

.selected-row {
  background: rgba(102, 126, 234, 0.1) !important;
}

/* 容器详情 */
.container-detail {
  height: 100%;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: var(--bg-secondary);
  border-radius: 6px;
}

.detail-label {
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 80px;
  font-size: 13px;
}

.detail-value {
  color: var(--text-primary);
  font-size: 13px;
  flex: 1;
  word-break: break-all;
}

.port-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: var(--bg-secondary);
  border-radius: 6px;
  margin-bottom: 8px;
}

.env-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.env-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.env-key {
  font-weight: 600;
  color: #42A5F5;
  font-size: 12px;
  font-family: 'Cascadia Code', 'JetBrains Mono', monospace;
  white-space: nowrap;
}

.env-value {
  color: var(--text-primary);
  font-size: 12px;
  font-family: 'Cascadia Code', 'JetBrains Mono', monospace;
  word-break: break-all;
  flex: 1;
}

/* 日志 */
.logs-section {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.logs-toolbar {
  display: flex;
  gap: 8px;
}

.logs-content {
  flex: 1;
  overflow: hidden;
  background: #1e1e1e;
  border-radius: 6px;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.logs-content .logs-pre {
  margin: 0;
  color: #d4d4d4;
  font-family: 'Cascadia Code', 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
  background: #1e1e1e;
  padding: 12px;
  border-radius: 0;
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
}

/* Java 日志颜色高亮 */
.logs-pre .log-error {
  color: #ff4444;
}

.logs-pre .log-warn {
  color: #ffaa00;
}

.logs-pre .log-info {
  color: #44dd44;
}

.logs-pre .log-debug {
  color: #4ecdc4;
}

.logs-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

/* 右键菜单 */
.context-menu {
  position: fixed;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 4px;
  z-index: 9999;
  min-width: 180px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 13px;
  transition: all 0.2s;
}

.context-menu-item:hover {
  background: var(--hover-bg);
}

.context-menu-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}

/* 镜像列表滑动动画 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
  max-height: 50vh;
  overflow: hidden;
}

.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
  margin-top: 0;
}

/* Compose 项目分组视图 */
.compose-projects-view {
  overflow-y: auto;
  padding: 12px;
}

.compose-project-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.compose-project-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
}

.project-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-secondary);
  cursor: pointer;
  transition: background-color 0.2s ease;
  user-select: none;
}

.project-header:hover {
  background: var(--hover-bg);
}

.project-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.expand-icon {
  transition: transform 0.3s ease;
  color: var(--text-secondary);
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.project-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.project-header-right {
  display: flex;
  gap: 8px;
}

.project-containers {
  border-top: 1px solid var(--border-color);
}

.container-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color-light);
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--bg-primary);
}

.container-item:last-child {
  border-bottom: none;
}

.container-item:hover {
  background: var(--hover-bg);
}

.container-item.selected {
  background: rgba(102, 126, 234, 0.1);
  border-left: 3px solid var(--color-primary);
}

.container-item-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 2;
  min-width: 0;
}

.container-item-middle {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 2;
  min-width: 0;
  padding: 0 12px;
}

.container-item-right {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.container-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.container-id-small {
  font-family: 'Cascadia Code', 'JetBrains Mono', monospace;
  font-size: 11px;
  padding: 2px 6px;
  background: rgba(102, 126, 234, 0.1);
  border-radius: 4px;
  color: #667eea;
  flex-shrink: 0;
}

.container-image {
  font-size: 13px;
  color: var(--text-secondary);
  font-family: 'Cascadia Code', 'JetBrains Mono', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.container-ports {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: 'Cascadia Code', 'JetBrains Mono', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 展开/收起动画 */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
  max-height: 1000px;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}

/* 加载动画 */
.spin-icon {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Docker 详情对话框 */
:deep(.docker-detail-dialog) {
  position: fixed !important;
  bottom: 0 !important;
  left: 0 !important;
  right: 0 !important;
  top: auto !important;
  margin: 0 !important;
  border-radius: 12px 12px 0 0 !important;
  max-height: 75vh !important;
  height: 75vh !important;
}

:deep(.docker-detail-dialog .el-dialog__header) {
  padding: 16px 20px !important;
  border-bottom: 1px solid var(--border-color) !important;
}

:deep(.docker-detail-dialog .el-dialog__body) {
  padding: 0 !important;
  height: calc(75vh - 60px) !important;
  overflow: hidden !important;
}

:deep(.docker-detail-dialog .el-tabs) {
  height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
}

:deep(.docker-detail-dialog .el-tabs__content) {
  flex: 1 !important;
  overflow-y: auto !important;
  padding: 16px 20px !important;
}

:deep(.docker-detail-dialog .el-tab-pane) {
  height: 100% !important;
}
</style>

