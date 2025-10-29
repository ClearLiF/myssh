<template>
  <div class="systemctl-manager-tab">
    <!-- 工具栏 -->
    <div class="systemctl-toolbar">
      <div class="toolbar-left">
        <el-icon :size="20"><Setting /></el-icon>
        <span class="toolbar-title">Systemctl 服务管理</span>
        <el-tag v-if="isConnected" type="success" size="small">
          {{ connection.username }}@{{ connection.host }}
        </el-tag>
        <el-tag v-if="systemInfo" type="info" size="small">
          服务总数: {{ systemInfo.totalServices || 0 }}
        </el-tag>
      </div>
      <div class="toolbar-right">
        <el-input
            v-model="searchKeyword"
            size="small"
            placeholder="搜索服务..."
            style="width: 200px"
            clearable
            :prefix-icon="Search"
        />
        <el-button size="small" @click="refreshServices">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button size="small" @click="autoRefresh = !autoRefresh" :type="autoRefresh ? 'primary' : ''">
          <el-icon><Timer /></el-icon>
          {{ autoRefresh ? '停止' : '自动' }}
        </el-button>
        <el-button size="small" @click="showCustomServicesDialog = true">
          <el-icon><Star /></el-icon>
          自定义常用
        </el-button>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="systemctl-content">
      <!-- 统计卡片 -->
      <div class="stats-cards">
        <div class="stat-card stat-card-total" @click="serviceFilter = 'all'">
          <div class="stat-icon">
            <el-icon :size="24"><Setting /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ services.length }}</div>
            <div class="stat-label">服务总数</div>
          </div>
        </div>
        <div class="stat-card stat-card-active" @click="serviceFilter = 'active'">
          <div class="stat-icon">
            <el-icon :size="24"><VideoPlay /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ activeServicesCount }}</div>
            <div class="stat-label">运行中</div>
          </div>
        </div>
        <div class="stat-card stat-card-inactive" @click="serviceFilter = 'inactive'">
          <div class="stat-icon">
            <el-icon :size="24"><VideoPause /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ inactiveServicesCount }}</div>
            <div class="stat-label">已停止</div>
          </div>
        </div>
        <div class="stat-card stat-card-failed" @click="serviceFilter = 'failed'">
          <div class="stat-icon">
            <el-icon :size="24"><WarningFilled /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ failedServicesCount }}</div>
            <div class="stat-label">失败</div>
          </div>
        </div>
        <div class="stat-card stat-card-enabled">
          <div class="stat-icon">
            <el-icon :size="24"><Check /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ enabledServicesCount }}</div>
            <div class="stat-label">已启用自启</div>
          </div>
        </div>
      </div>

      <!-- 服务列表 -->
      <div class="services-section">
        <div class="section-header">
          <div class="section-title">
            <el-icon><List /></el-icon>
            <span>系统服务列表</span>
            <el-tag size="small" type="info">{{ filteredServices.length }}</el-tag>
          </div>
          <div style="display: flex; gap: 12px; align-items: center;">
            <el-radio-group v-model="viewMode" size="small">
              <el-radio-button label="list">列表视图</el-radio-button>
              <el-radio-button label="group">分组视图</el-radio-button>
            </el-radio-group>
            <el-checkbox v-model="showOnlyUserServices" size="small" border>
              仅显示常用服务
            </el-checkbox>
            <el-radio-group v-model="serviceFilter" size="small">
              <el-radio-button label="all">全部</el-radio-button>
              <el-radio-button label="active">运行中</el-radio-button>
              <el-radio-button label="inactive">已停止</el-radio-button>
              <el-radio-button label="failed">失败</el-radio-button>
            </el-radio-group>
            <el-radio-group v-model="serviceType" size="small">
              <el-radio-button label="all">所有类型</el-radio-button>
              <el-radio-button label="service">服务</el-radio-button>
              <el-radio-button label="timer">定时器</el-radio-button>
              <el-radio-button label="socket">套接字</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <!-- 列表视图 -->
        <el-table
            v-if="viewMode === 'list'"
            :data="filteredServices"
            stripe
            :height="serviceTableHeight"
            style="width: 100%"
            class="systemctl-table"
            @row-click="handleServiceClick"
            @row-contextmenu="handleServiceContextMenu"
            :row-class-name="getServiceRowClassName"
            highlight-current-row
            v-loading="loading"
        >
          <el-table-column label="状态" width="100">
            <template #default="scope">
              <el-tag
                  :type="getServiceStatusType(scope.row.activeState)"
                  size="small"
              >
                {{ getServiceStatusText(scope.row.activeState) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="开机自启" width="100">
            <template #default="scope">
              <el-tag
                  :type="scope.row.enabled === 'enabled' ? 'success' : 'info'"
                  size="small"
                  effect="plain"
              >
                {{ scope.row.enabled === 'enabled' ? '已启用' : '未启用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="服务名称" min-width="200" show-overflow-tooltip>
            <template #default="scope">
              <div style="display: flex; align-items: center; gap: 8px;">
                <el-icon v-if="scope.row.unit.endsWith('.timer')" :size="16" color="#E6A23C"><Timer /></el-icon>
                <el-icon v-else :size="16" color="#409EFF"><Setting /></el-icon>
                <span>{{ scope.row.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="unit" label="单元文件" min-width="180" show-overflow-tooltip>
            <template #default="scope">
              <code class="unit-name">{{ scope.row.unit }}</code>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="描述" min-width="250" show-overflow-tooltip />
          <el-table-column prop="subState" label="子状态" width="120" show-overflow-tooltip>
            <template #default="scope">
              <el-tag
                  size="small"
                  effect="plain"
                  :type="scope.row.subState === 'running' ? 'success' : 'info'"
              >
                {{ scope.row.subState || '-' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="350" fixed="right">
            <template #default="scope">
              <el-button-group size="small">
                <el-button
                    v-if="scope.row.activeState !== 'active'"
                    size="small"
                    type="success"
                    @click.stop="startService(scope.row)"
                    :loading="scope.row.starting"
                    :disabled="scope.row.stopping || scope.row.restarting"
                >
                  <el-icon :class="{ 'spin-icon': scope.row.starting }"><VideoPlay /></el-icon>
                  {{ scope.row.starting ? '启动中...' : '启动' }}
                </el-button>
                <el-button
                    v-else
                    size="small"
                    type="warning"
                    @click.stop="stopService(scope.row)"
                    :loading="scope.row.stopping"
                    :disabled="scope.row.starting || scope.row.restarting"
                >
                  <el-icon :class="{ 'spin-icon': scope.row.stopping }"><VideoPause /></el-icon>
                  {{ scope.row.stopping ? '停止中...' : '停止' }}
                </el-button>
                <el-button
                    size="small"
                    @click.stop="restartService(scope.row)"
                    :loading="scope.row.restarting"
                    :disabled="scope.row.starting || scope.row.stopping"
                >
                  <el-icon :class="{ 'spin-icon': scope.row.restarting }"><Refresh /></el-icon>
                  {{ scope.row.restarting ? '重启中...' : '重启' }}
                </el-button>
                <el-button
                    v-if="scope.row.enabled !== 'enabled'"
                    size="small"
                    type="primary"
                    @click.stop="enableService(scope.row)"
                    :loading="scope.row.enabling"
                >
                  <el-icon :class="{ 'spin-icon': scope.row.enabling }"><Check /></el-icon>
                  {{ scope.row.enabling ? '启用中...' : '启用' }}
                </el-button>
                <el-button
                    v-else
                    size="small"
                    @click.stop="disableService(scope.row)"
                    :loading="scope.row.disabling"
                >
                  <el-icon :class="{ 'spin-icon': scope.row.disabling }"><Close /></el-icon>
                  {{ scope.row.disabling ? '禁用中...' : '禁用' }}
                </el-button>
              </el-button-group>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分组视图 -->
        <div v-else class="services-group-view" :style="{ height: serviceTableHeight }">
          <!-- 系统服务组 -->
          <div class="service-group-card">
            <div class="group-header" @click="toggleGroup('system')">
              <div class="group-header-left">
                <el-icon class="expand-icon" :class="{ expanded: expandedGroups.has('system') }">
                  <ArrowRight />
                </el-icon>
                <el-icon :size="20" color="#409EFF"><Setting /></el-icon>
                <span class="group-name">系统服务</span>
                <el-tag type="primary" size="small">{{ systemServices.length }} 个服务</el-tag>
                <el-tag
                    :type="getGroupRunningType(systemServices)"
                    size="small"
                >
                  {{ getGroupRunningCount(systemServices) }} 运行中
                </el-tag>
              </div>
            </div>

            <!-- 系统服务列表 -->
            <transition name="expand">
              <div v-show="expandedGroups.has('system')" class="group-services">
                <div
                    v-for="service in systemServices"
                    :key="service.unit"
                    class="service-item"
                    @click="handleServiceClick(service)"
                    @contextmenu.prevent="handleServiceContextMenu(service, null, $event)"
                    :class="{ 'selected': selectedService?.unit === service.unit }"
                >
                  <div class="service-item-left">
                    <el-tag :type="getServiceStatusType(service.activeState)" size="small">
                      {{ getServiceStatusText(service.activeState) }}
                    </el-tag>
                    <el-icon v-if="service.unit.endsWith('.timer')" :size="16" color="#E6A23C"><Timer /></el-icon>
                    <el-icon v-else-if="service.unit.endsWith('.socket')" :size="16" color="#67C23A"><Connection /></el-icon>
                    <el-icon v-else :size="16" color="#409EFF"><Setting /></el-icon>
                    <span class="service-name">{{ service.name }}</span>
                    <code class="service-unit-small">{{ service.unit }}</code>
                  </div>
                  <div class="service-item-middle">
                    <span class="service-description">{{ service.description || '-' }}</span>
                  </div>
                  <div class="service-item-right">
                    <el-button-group size="small">
                      <el-button
                          v-if="service.activeState !== 'active'"
                          size="small"
                          type="success"
                          @click.stop="startService(service)"
                          :loading="service.starting"
                          :disabled="service.stopping || service.restarting"
                          title="启动服务"
                      >
                        <el-icon :class="{ 'spin-icon': service.starting }"><VideoPlay /></el-icon>
                      </el-button>
                      <el-button
                          v-else
                          size="small"
                          type="warning"
                          @click.stop="stopService(service)"
                          :loading="service.stopping"
                          :disabled="service.starting || service.restarting"
                          title="停止服务"
                      >
                        <el-icon :class="{ 'spin-icon': service.stopping }"><VideoPause /></el-icon>
                      </el-button>
                      <el-button
                          size="small"
                          @click.stop="restartService(service)"
                          :loading="service.restarting"
                          :disabled="service.starting || service.stopping"
                          title="重启服务"
                      >
                        <el-icon :class="{ 'spin-icon': service.restarting }"><Refresh /></el-icon>
                      </el-button>
                    </el-button-group>
                  </div>
                </div>
              </div>
            </transition>
          </div>

          <!-- 用户服务组 -->
          <div class="service-group-card">
            <div class="group-header" @click="toggleGroup('user')">
              <div class="group-header-left">
                <el-icon class="expand-icon" :class="{ expanded: expandedGroups.has('user') }">
                  <ArrowRight />
                </el-icon>
                <el-icon :size="20" color="#67C23A"><User /></el-icon>
                <span class="group-name">用户服务</span>
                <el-tag type="success" size="small">{{ userServices.length }} 个服务</el-tag>
                <el-tag
                    :type="getGroupRunningType(userServices)"
                    size="small"
                >
                  {{ getGroupRunningCount(userServices) }} 运行中
                </el-tag>
              </div>
            </div>

            <!-- 用户服务列表 -->
            <transition name="expand">
              <div v-show="expandedGroups.has('user')" class="group-services">
                <div
                    v-for="service in userServices"
                    :key="service.unit"
                    class="service-item"
                    @click="handleServiceClick(service)"
                    @contextmenu.prevent="handleServiceContextMenu(service, null, $event)"
                    :class="{ 'selected': selectedService?.unit === service.unit }"
                >
                  <div class="service-item-left">
                    <el-tag :type="getServiceStatusType(service.activeState)" size="small">
                      {{ getServiceStatusText(service.activeState) }}
                    </el-tag>
                    <el-icon v-if="service.unit.endsWith('.timer')" :size="16" color="#E6A23C"><Timer /></el-icon>
                    <el-icon v-else-if="service.unit.endsWith('.socket')" :size="16" color="#67C23A"><Connection /></el-icon>
                    <el-icon v-else :size="16" color="#409EFF"><Setting /></el-icon>
                    <span class="service-name">{{ service.name }}</span>
                    <code class="service-unit-small">{{ service.unit }}</code>
                  </div>
                  <div class="service-item-middle">
                    <span class="service-description">{{ service.description || '-' }}</span>
                  </div>
                  <div class="service-item-right">
                    <el-button-group size="small">
                      <el-button
                          v-if="service.activeState !== 'active'"
                          size="small"
                          type="success"
                          @click.stop="startService(service)"
                          :loading="service.starting"
                          :disabled="service.stopping || service.restarting"
                          title="启动服务"
                      >
                        <el-icon :class="{ 'spin-icon': service.starting }"><VideoPlay /></el-icon>
                      </el-button>
                      <el-button
                          v-else
                          size="small"
                          type="warning"
                          @click.stop="stopService(service)"
                          :loading="service.stopping"
                          :disabled="service.starting || service.restarting"
                          title="停止服务"
                      >
                        <el-icon :class="{ 'spin-icon': service.stopping }"><VideoPause /></el-icon>
                      </el-button>
                      <el-button
                          size="small"
                          @click.stop="restartService(service)"
                          :loading="service.restarting"
                          :disabled="service.starting || service.stopping"
                          title="重启服务"
                      >
                        <el-icon :class="{ 'spin-icon': service.restarting }"><Refresh /></el-icon>
                      </el-button>
                    </el-button-group>
                  </div>
                </div>
              </div>
            </transition>
          </div>
        </div>
      </div>
    </div>

    <!-- 服务详情对话框 -->
    <el-dialog
        v-model="detailDialogVisible"
        :title="`服务详情 - ${selectedService?.name || ''}`"
        width="100%"
        :height="400"
        @close="stopLogsStream"
        class="service-detail-dialog"
    >
      <div v-if="serviceDetail" class="service-detail">
        <el-tabs v-model="activeDetailTab">
          <!-- 基本信息 -->
          <el-tab-pane label="基本信息" name="info">
            <div class="detail-section">
              <div class="detail-item">
                <span class="detail-label">服务名称:</span>
                <span class="detail-value">{{ serviceDetail.name }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">单元文件:</span>
                <code class="detail-value">{{ serviceDetail.unit }}</code>
              </div>
              <div class="detail-item">
                <span class="detail-label">描述:</span>
                <span class="detail-value">{{ serviceDetail.description || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">激活状态:</span>
                <el-tag :type="getServiceStatusType(serviceDetail.activeState)">
                  {{ getServiceStatusText(serviceDetail.activeState) }}
                </el-tag>
              </div>
              <div class="detail-item">
                <span class="detail-label">子状态:</span>
                <el-tag type="info">{{ serviceDetail.subState || '-' }}</el-tag>
              </div>
              <div class="detail-item">
                <span class="detail-label">开机自启:</span>
                <el-tag :type="serviceDetail.enabled === 'enabled' ? 'success' : 'info'">
                  {{ serviceDetail.enabled === 'enabled' ? '已启用' : '未启用' }}
                </el-tag>
              </div>
              <div class="detail-item">
                <span class="detail-label">加载状态:</span>
                <el-tag type="info">{{ serviceDetail.loadState || '-' }}</el-tag>
              </div>
              <div v-if="serviceDetail.mainPID" class="detail-item">
                <span class="detail-label">主进程 PID:</span>
                <code class="detail-value">{{ serviceDetail.mainPID }}</code>
              </div>
            </div>
          </el-tab-pane>

          <!-- 完整状态 -->
          <el-tab-pane label="完整状态" name="status">
            <div class="status-section">
              <div class="status-toolbar">
                <el-button
                    size="small"
                    @click="loadServiceStatus(selectedService)"
                    :loading="statusLoading"
                >
                  <el-icon><Refresh /></el-icon>
                  刷新状态
                </el-button>
              </div>
              <div class="status-content" v-loading="statusLoading">
                <pre v-if="serviceStatus" class="status-pre">{{ serviceStatus }}</pre>
                <el-empty v-else description="暂无状态信息" :image-size="80">
                  <el-button
                      type="primary"
                      size="small"
                      @click="loadServiceStatus(selectedService)"
                      :loading="statusLoading"
                  >
                    加载状态
                  </el-button>
                </el-empty>
              </div>
            </div>
          </el-tab-pane>

          <!-- 服务日志 -->
          <el-tab-pane label="服务日志" name="logs">
            <div class="logs-section">
              <div class="logs-toolbar">
                <el-button
                    size="small"
                    @click="loadServiceLogs(selectedService)"
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
                <el-input-number
                    v-model="logLines"
                    size="small"
                    :min="50"
                    :max="1000"
                    :step="50"
                    style="width: 120px"
                />
                <el-tag size="small" type="info">
                  最近 {{ logLines }} 行 {{ logsStreaming ? '(实时)' : '' }}
                </el-tag>
              </div>
              <div class="logs-content" v-loading="logsLoading">
                <pre v-if="serviceLogs && serviceLogs !== '暂无日志'" class="logs-pre" ref="logsPreRef" v-html="highlightedLogs"></pre>
                <el-empty v-else description="暂无日志" :image-size="80">
                  <el-button
                      type="primary"
                      size="small"
                      @click="loadServiceLogs(selectedService)"
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

    <!-- 自定义常用服务对话框 -->
    <el-dialog
        v-model="showCustomServicesDialog"
        title="自定义常用服务"
        width="600px"
    >
      <div class="custom-services-dialog">
        <div class="dialog-section">
          <div class="section-title">
            <el-icon><Star /></el-icon>
            <span>系统预定义服务（{{ defaultCommonServices.length }}个）</span>
          </div>
          <div class="services-tags">
            <el-tag
                v-for="service in defaultCommonServices"
                :key="service"
                size="small"
                effect="plain"
                type="info"
                style="margin: 4px;"
            >
              {{ service }}
            </el-tag>
          </div>
        </div>

        <el-divider />

        <div class="dialog-section">
          <div class="section-title">
            <el-icon><Edit /></el-icon>
            <span>自定义服务（{{ customCommonServices.length }}个）</span>
          </div>
          <div class="add-service-form">
            <el-input
                v-model="newServiceKeyword"
                placeholder="输入服务关键词，例如: myapp"
                size="small"
                style="width: 300px;"
                @keyup.enter="addCustomService"
            />
            <el-button size="small" type="primary" @click="addCustomService">
              <el-icon><Plus /></el-icon>
              添加
            </el-button>
          </div>
          <div class="services-tags" style="margin-top: 12px;">
            <el-tag
                v-for="service in customCommonServices"
                :key="service"
                size="small"
                type="success"
                closable
                @close="removeCustomService(service)"
                style="margin: 4px;"
            >
              {{ service }}
            </el-tag>
            <el-empty
                v-if="customCommonServices.length === 0"
                description="暂无自定义服务"
                :image-size="60"
            />
          </div>
        </div>

        <el-divider />

        <div class="dialog-tips">
          <el-alert
              title="使用说明"
              type="info"
              :closable="false"
              show-icon
          >
            <ul style="margin: 8px 0; padding-left: 20px;">
              <li>添加服务关键词后，包含该关键词的服务会被标记为"常用服务"</li>
              <li>勾选"仅显示常用服务"可快速过滤出这些服务</li>
              <li>自定义服务列表会自动保存到本地</li>
              <li>示例：添加 "myapp" 后，"myapp.service" 和 "myapp-worker.service" 都会被识别</li>
            </ul>
          </el-alert>
        </div>
      </div>

      <template #footer>
        <el-button @click="showCustomServicesDialog = false">关闭</el-button>
        <el-button type="danger" @click="resetCustomServices">
          <el-icon><Delete /></el-icon>
          清空自定义
        </el-button>
      </template>
    </el-dialog>

    <!-- 右键菜单 -->
    <div
        v-if="contextMenuVisible"
        class="context-menu"
        :style="{ top: contextMenuPosition.y + 'px', left: contextMenuPosition.x + 'px' }"
        @click.stop
    >
      <div class="context-menu-item" @click="copyServiceName">
        <el-icon><DocumentCopy /></el-icon>
        <span>复制服务名</span>
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" @click="viewStatus">
        <el-icon><Document /></el-icon>
        <span>查看状态</span>
      </div>
      <div class="context-menu-item" @click="viewLogs">
        <el-icon><Tickets /></el-icon>
        <span>查看日志</span>
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" @click="addToCustomCommon">
        <el-icon><Star /></el-icon>
        <span>添加到常用服务</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Setting, Search, Refresh, Timer, List, VideoPlay, VideoPause,
  Check, Close, Document, DocumentCopy, Monitor, Delete, Tickets, WarningFilled,
  ArrowRight, User, Connection, Star, Edit, Plus
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
const services = ref([])
const systemInfo = ref(null)
const searchKeyword = ref('')
const autoRefresh = ref(false)
const serviceFilter = ref('all')
const serviceType = ref('all')
const viewMode = ref('list') // 'list' 或 'group'
const expandedGroups = ref(new Set(['system', 'user'])) // 默认展开所有组
const showOnlyUserServices = ref(false)
const loading = ref(false)
const selectedService = ref(null)
const serviceDetail = ref(null)
const serviceStatus = ref('')
const serviceLogs = ref('')
const detailDialogVisible = ref(false)
const activeDetailTab = ref('info')
const statusLoading = ref(false)
const logsLoading = ref(false)
const logsStreaming = ref(false)
const logLines = ref(200)
const logsPreRef = ref(null)
let logsStreamInterval = null

// 自定义常用服务
const showCustomServicesDialog = ref(false)
const customCommonServices = ref([])
const newServiceKeyword = ref('')

// 右键菜单
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuItem = ref(null)

// 定时器
let refreshTimer = null

// 系统预定义的常用服务列表
const defaultCommonServices = [
  'nginx', 'apache2', 'httpd', 'mysql', 'mariadb', 'postgresql', 'redis',
  'mongodb', 'docker', 'ssh', 'sshd', 'cron', 'systemd-timesyncd',
  'firewalld', 'ufw', 'fail2ban', 'postfix', 'dovecot', 'vsftpd',
  'tomcat', 'jenkins', 'gitlab', 'elasticsearch', 'rabbitmq', 'kafka',
  'zookeeper', 'consul', 'etcd', 'prometheus', 'grafana', 'node_exporter'
]

// 合并系统预定义和用户自定义的常用服务
const commonServices = computed(() => {
  return [...defaultCommonServices, ...customCommonServices.value]
})

// 系统服务列表（systemd 默认服务）
const systemServicePrefixes = [
  'systemd-', 'dbus', 'polkit', 'accounts-daemon', 'udisks2',
  'upower', 'network', 'NetworkManager', 'wpa_supplicant',
  'bluetooth', 'avahi-', 'cups', 'rsyslog', 'cron', 'atd',
  'irqbalance', 'lvm2-', 'multipathd', 'ModemManager',
  'packagekit', 'rtkit-daemon', 'colord', 'gdm', 'lightdm',
  'sddm', 'plymouth', 'getty@', 'serial-getty@', 'console-',
  'emergency', 'rescue', 'ssh', 'sshd', 'firewalld', 'ufw',
  'apparmor', 'auditd', 'rsync', 'nfs-', 'rpc-', 'autofs'
]

// 判断是否为系统服务
const isSystemService = (serviceName) => {
  const lowerName = serviceName.toLowerCase()
  return systemServicePrefixes.some(prefix => lowerName.startsWith(prefix.toLowerCase()))
}

// 统计数据
const activeServicesCount = computed(() => {
  return services.value.filter(s => s.activeState === 'active').length
})

const inactiveServicesCount = computed(() => {
  return services.value.filter(s => s.activeState === 'inactive').length
})

const failedServicesCount = computed(() => {
  return services.value.filter(s => s.activeState === 'failed').length
})

const enabledServicesCount = computed(() => {
  return services.value.filter(s => s.enabled === 'enabled').length
})

// 过滤后的服务列表
const filteredServices = computed(() => {
  let result = services.value

  // 常用服务过滤
  if (showOnlyUserServices.value) {
    result = result.filter(s => {
      const serviceName = s.name.toLowerCase()
      return commonServices.value.some(common => serviceName.includes(common.toLowerCase()))
    })
  }

  // 状态过滤
  if (serviceFilter.value === 'active') {
    result = result.filter(s => s.activeState === 'active')
  } else if (serviceFilter.value === 'inactive') {
    result = result.filter(s => s.activeState === 'inactive')
  } else if (serviceFilter.value === 'failed') {
    result = result.filter(s => s.activeState === 'failed')
  }

  // 类型过滤
  if (serviceType.value === 'service') {
    result = result.filter(s => s.unit.endsWith('.service'))
  } else if (serviceType.value === 'timer') {
    result = result.filter(s => s.unit.endsWith('.timer'))
  } else if (serviceType.value === 'socket') {
    result = result.filter(s => s.unit.endsWith('.socket'))
  }

  // 搜索过滤
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    result = result.filter(s => {
      return s.name.toLowerCase().includes(keyword) ||
          s.unit.toLowerCase().includes(keyword) ||
          (s.description && s.description.toLowerCase().includes(keyword))
    })
  }

  return result
})

// 系统服务列表
const systemServices = computed(() => {
  return filteredServices.value.filter(s => isSystemService(s.name))
})

// 用户服务列表
const userServices = computed(() => {
  return filteredServices.value.filter(s => !isSystemService(s.name))
})

// 获取分组运行中的服务数量
const getGroupRunningCount = (services) => {
  return services.filter(s => s.activeState === 'active').length
}

// 获取分组运行状态标签类型
const getGroupRunningType = (services) => {
  const runningCount = getGroupRunningCount(services)
  if (runningCount === 0) return 'info'
  if (runningCount === services.length) return 'success'
  return 'warning'
}

// 切换分组展开/折叠
const toggleGroup = (groupName) => {
  if (expandedGroups.value.has(groupName)) {
    expandedGroups.value.delete(groupName)
  } else {
    expandedGroups.value.add(groupName)
  }
  // 触发响应式更新
  expandedGroups.value = new Set(expandedGroups.value)
}

// 服务表格高度
const serviceTableHeight = computed(() => {
  return 'calc(100vh - 310px)' // 为统计卡片留出空间
})

// 日志高亮处理
const highlightedLogs = computed(() => {
  if (!serviceLogs.value) return ''

  let html = serviceLogs.value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

  // 按行处理，根据日志级别着色整行
  const lines = html.split('\n')
  const coloredLines = lines.map(line => {
    if (line.includes('ERROR') || line.includes('FATAL') || line.includes('error') || line.includes('failed')) {
      return `<span class="log-error">${line}</span>`
    } else if (line.includes('WARN') || line.includes('WARNING') || line.includes('warn')) {
      return `<span class="log-warn">${line}</span>`
    } else if (line.includes('INFO') || line.includes('info')) {
      return `<span class="log-info">${line}</span>`
    } else if (line.includes('DEBUG') || line.includes('TRACE') || line.includes('debug')) {
      return `<span class="log-debug">${line}</span>`
    }
    return line
  })

  return coloredLines.join('\n')
})

// 获取服务状态类型（用于标签颜色）
const getServiceStatusType = (status) => {
  const statusMap = {
    'active': 'success',
    'inactive': 'info',
    'failed': 'danger',
    'activating': 'warning',
    'deactivating': 'warning'
  }
  return statusMap[status] || 'info'
}

// 获取服务状态文本
const getServiceStatusText = (status) => {
  const statusMap = {
    'active': '运行中',
    'inactive': '已停止',
    'failed': '失败',
    'activating': '启动中',
    'deactivating': '停止中'
  }
  return statusMap[status] || status
}

// 获取服务行类名
const getServiceRowClassName = ({ row }) => {
  return selectedService.value && selectedService.value.unit === row.unit ? 'selected-row' : ''
}

// 处理服务行点击
const handleServiceClick = async (row) => {
  selectedService.value = row
  serviceDetail.value = null
  serviceStatus.value = ''
  serviceLogs.value = ''
  await loadServiceDetail(row)
  detailDialogVisible.value = true
}

// 处理服务右键菜单
const handleServiceContextMenu = (row, column, event) => {
  event.preventDefault()
  contextMenuItem.value = row
  contextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY
  }
  contextMenuVisible.value = true
}

// 复制服务名
const copyServiceName = async () => {
  if (contextMenuItem.value) {
    try {
      await navigator.clipboard.writeText(contextMenuItem.value.unit)
      ElMessage.success('已复制服务名')
    } catch (error) {
      ElMessage.error('复制失败')
    }
  }
  contextMenuVisible.value = false
}

// 查看状态
const viewStatus = () => {
  if (contextMenuItem.value) {
    selectedService.value = contextMenuItem.value
    loadServiceDetail(contextMenuItem.value)
    activeDetailTab.value = 'status'
    detailDialogVisible.value = true
  }
  contextMenuVisible.value = false
}

// 查看日志
const viewLogs = () => {
  if (contextMenuItem.value) {
    selectedService.value = contextMenuItem.value
    loadServiceDetail(contextMenuItem.value)
    activeDetailTab.value = 'logs'
    detailDialogVisible.value = true
  }
  contextMenuVisible.value = false
}

// 点击其他地方关闭右键菜单
const handleClickOutside = () => {
  contextMenuVisible.value = false
}

// 添加自定义常用服务
const addCustomService = () => {
  const keyword = newServiceKeyword.value.trim().toLowerCase()
  
  if (!keyword) {
    ElMessage.warning('请输入服务关键词')
    return
  }
  
  // 检查是否已存在
  if (defaultCommonServices.includes(keyword)) {
    ElMessage.warning('该服务已在系统预定义列表中')
    return
  }
  
  if (customCommonServices.value.includes(keyword)) {
    ElMessage.warning('该服务已存在')
    return
  }
  
  customCommonServices.value.push(keyword)
  newServiceKeyword.value = ''
  saveCustomServices()
  ElMessage.success(`已添加 "${keyword}" 到常用服务`)
}

// 删除自定义常用服务
const removeCustomService = (service) => {
  const index = customCommonServices.value.indexOf(service)
  if (index > -1) {
    customCommonServices.value.splice(index, 1)
    saveCustomServices()
    ElMessage.success(`已移除 "${service}"`)
  }
}

// 清空自定义服务
const resetCustomServices = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要清空所有自定义常用服务吗？',
      '确认操作',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    customCommonServices.value = []
    saveCustomServices()
    ElMessage.success('已清空自定义服务列表')
  } catch (error) {
    // 用户取消
  }
}

// 从右键菜单添加到常用服务
const addToCustomCommon = () => {
  if (contextMenuItem.value) {
    const serviceName = contextMenuItem.value.name
    
    // 提取服务名的关键部分（去掉常见后缀）
    let keyword = serviceName
      .replace(/\.service$/, '')
      .replace(/\.timer$/, '')
      .replace(/\.socket$/, '')
      .toLowerCase()
    
    // 检查是否已存在
    if (defaultCommonServices.includes(keyword) || customCommonServices.value.includes(keyword)) {
      ElMessage.info('该服务已在常用列表中')
      contextMenuVisible.value = false
      return
    }
    
    customCommonServices.value.push(keyword)
    saveCustomServices()
    ElMessage.success(`已添加 "${keyword}" 到常用服务`)
  }
  contextMenuVisible.value = false
}

// 保存自定义服务到本地存储
const saveCustomServices = () => {
  try {
    localStorage.setItem('systemctl_custom_services', JSON.stringify(customCommonServices.value))
  } catch (error) {
    console.error('保存自定义服务失败:', error)
  }
}

// 加载自定义服务
const loadCustomServices = () => {
  try {
    const saved = localStorage.getItem('systemctl_custom_services')
    if (saved) {
      customCommonServices.value = JSON.parse(saved)
    }
  } catch (error) {
    console.error('加载自定义服务失败:', error)
    customCommonServices.value = []
  }
}

// 刷新服务列表
const refreshServices = async () => {
  if (!window.electronAPI || !props.connectionId) {
    // 模拟数据
    services.value = [
      {
        name: 'nginx',
        unit: 'nginx.service',
        description: 'A high performance web server and reverse proxy',
        activeState: 'active',
        subState: 'running',
        enabled: 'enabled',
        loadState: 'loaded',
        starting: false,
        stopping: false,
        restarting: false,
        enabling: false,
        disabling: false
      },
      {
        name: 'mysql',
        unit: 'mysql.service',
        description: 'MySQL Community Server',
        activeState: 'active',
        subState: 'running',
        enabled: 'enabled',
        loadState: 'loaded',
        starting: false,
        stopping: false,
        restarting: false,
        enabling: false,
        disabling: false
      },
      {
        name: 'redis',
        unit: 'redis.service',
        description: 'Advanced key-value store',
        activeState: 'inactive',
        subState: 'dead',
        enabled: 'disabled',
        loadState: 'loaded',
        starting: false,
        stopping: false,
        restarting: false,
        enabling: false,
        disabling: false
      },
      {
        name: 'docker',
        unit: 'docker.service',
        description: 'Docker Application Container Engine',
        activeState: 'active',
        subState: 'running',
        enabled: 'enabled',
        loadState: 'loaded',
        starting: false,
        stopping: false,
        restarting: false,
        enabling: false,
        disabling: false
      },
      {
        name: 'ssh',
        unit: 'ssh.service',
        description: 'OpenBSD Secure Shell server',
        activeState: 'active',
        subState: 'running',
        enabled: 'enabled',
        loadState: 'loaded',
        starting: false,
        stopping: false,
        restarting: false,
        enabling: false,
        disabling: false
      }
    ]
    systemInfo.value = { totalServices: services.value.length }
    return
  }

  loading.value = true
  try {
    const result = await window.electronAPI.ssh.getSystemctlServices(props.connectionId)
    if (result.success && result.services) {
      services.value = result.services.map(s => ({
        ...s,
        starting: false,
        stopping: false,
        restarting: false,
        enabling: false,
        disabling: false
      }))
      systemInfo.value = { totalServices: services.value.length }
    } else {
      ElMessage.error('获取服务列表失败: ' + (result.message || '未知错误'))
    }
  } catch (error) {
    console.error('获取服务列表失败:', error)
    ElMessage.error('获取服务列表失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

// 加载服务详情
const loadServiceDetail = async (service) => {
  serviceDetail.value = {
    name: service.name,
    unit: service.unit,
    description: service.description,
    activeState: service.activeState,
    subState: service.subState,
    enabled: service.enabled,
    loadState: service.loadState,
    mainPID: service.mainPID
  }
}

// 加载服务状态
const loadServiceStatus = async (service) => {
  if (!service) return

  statusLoading.value = true

  try {
    if (!window.electronAPI || !props.connectionId) {
      // 模拟数据
      await new Promise(resolve => setTimeout(resolve, 500))
      serviceStatus.value = `● ${service.unit} - ${service.description}
   Loaded: ${service.loadState} (/lib/systemd/system/${service.unit}; ${service.enabled})
   Active: ${service.activeState} (${service.subState})
     Docs: man:${service.name}(8)
  Process: 12345 ExecStart=/usr/bin/${service.name} (code=exited, status=0/SUCCESS)
 Main PID: 12345 (${service.name})
    Tasks: 1 (limit: 4915)
   Memory: 5.2M
      CPU: 127ms
   CGroup: /system.slice/${service.unit}
           └─12345 /usr/bin/${service.name}`
      return
    }

    const result = await window.electronAPI.ssh.getSystemctlServiceStatus(props.connectionId, service.unit)
    if (result.success) {
      serviceStatus.value = result.status || '暂无状态信息'
    } else {
      ElMessage.error('获取服务状态失败: ' + (result.message || '未知错误'))
      serviceStatus.value = ''
    }
  } catch (error) {
    console.error('获取服务状态失败:', error)
    ElMessage.error('获取服务状态失败: ' + error.message)
    serviceStatus.value = ''
  } finally {
    statusLoading.value = false
  }
}

// 加载服务日志
const loadServiceLogs = async (service) => {
  if (!service) return

  logsLoading.value = true

  try {
    if (!window.electronAPI || !props.connectionId) {
      // 模拟数据
      await new Promise(resolve => setTimeout(resolve, 500))
      serviceLogs.value = `-- Logs begin at ${new Date().toLocaleDateString()} --
${new Date().toLocaleTimeString()} systemd[1]: Starting ${service.description}...
${new Date().toLocaleTimeString()} ${service.name}[12345]: Started successfully
${new Date().toLocaleTimeString()} ${service.name}[12345]: Listening on port 80
${new Date().toLocaleTimeString()} ${service.name}[12345]: Server is ready to accept connections
${new Date().toLocaleTimeString()} systemd[1]: Started ${service.description}.`
      return
    }

    const result = await window.electronAPI.ssh.getSystemctlServiceLogs(
        props.connectionId,
        service.unit,
        logLines.value
    )
    if (result.success) {
      serviceLogs.value = result.logs || '暂无日志'
    } else {
      ElMessage.error('获取服务日志失败: ' + (result.message || '未知错误'))
      serviceLogs.value = ''
    }
  } catch (error) {
    console.error('获取服务日志失败:', error)
    ElMessage.error('获取服务日志失败: ' + error.message)
    serviceLogs.value = ''
  } finally {
    logsLoading.value = false
  }
}

// 清空日志显示
const clearLogs = () => {
  serviceLogs.value = ''
}

// 切换实时日志流
const toggleLogsStream = () => {
  if (logsStreaming.value) {
    stopLogsStream()
  } else {
    startLogsStream()
  }
}

// 启动实时日志流
const startLogsStream = async () => {
  if (!selectedService.value) return

  logsStreaming.value = true

  // 演示模式或实际模式：定期刷新日志
  logsStreamInterval = setInterval(async () => {
    if (!logsStreaming.value) {
      clearInterval(logsStreamInterval)
      logsStreamInterval = null
      return
    }
    await loadServiceLogs(selectedService.value)
    // 自动滚动到底部
    nextTick(() => {
      if (logsPreRef.value) {
        logsPreRef.value.scrollTop = logsPreRef.value.scrollHeight
      }
    })
  }, 3000) // 每 3 秒刷新一次

  // 立即加载一次
  await loadServiceLogs(selectedService.value)
}

// 停止实时日志流
const stopLogsStream = () => {
  logsStreaming.value = false

  if (logsStreamInterval) {
    clearInterval(logsStreamInterval)
    logsStreamInterval = null
  }
}

// 启动服务
const startService = async (service) => {
  service.starting = true

  try {
    if (!window.electronAPI || !props.connectionId) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      ElMessage.success('演示模式：服务已启动')
      service.activeState = 'active'
      service.subState = 'running'
      return
    }

    const result = await window.electronAPI.ssh.startSystemctlService(props.connectionId, service.unit)
    if (result.success) {
      ElMessage.success('服务已启动')
      await refreshServices()
    } else {
      ElMessage.error('启动服务失败: ' + (result.message || '未知错误'))
    }
  } catch (error) {
    console.error('启动服务失败:', error)
    ElMessage.error('启动服务失败: ' + error.message)
  } finally {
    service.starting = false
  }
}

// 停止服务
const stopService = async (service) => {
  service.stopping = true

  try {
    if (!window.electronAPI || !props.connectionId) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      ElMessage.success('演示模式：服务已停止')
      service.activeState = 'inactive'
      service.subState = 'dead'
      return
    }

    const result = await window.electronAPI.ssh.stopSystemctlService(props.connectionId, service.unit)
    if (result.success) {
      ElMessage.success('服务已停止')
      await refreshServices()
    } else {
      ElMessage.error('停止服务失败: ' + (result.message || '未知错误'))
    }
  } catch (error) {
    console.error('停止服务失败:', error)
    ElMessage.error('停止服务失败: ' + error.message)
  } finally {
    service.stopping = false
  }
}

// 重启服务
const restartService = async (service) => {
  service.restarting = true

  try {
    if (!window.electronAPI || !props.connectionId) {
      await new Promise(resolve => setTimeout(resolve, 1500))
      ElMessage.success('演示模式：服务已重启')
      return
    }

    const result = await window.electronAPI.ssh.restartSystemctlService(props.connectionId, service.unit)
    if (result.success) {
      ElMessage.success('服务已重启')
      await refreshServices()
    } else {
      ElMessage.error('重启服务失败: ' + (result.message || '未知错误'))
    }
  } catch (error) {
    console.error('重启服务失败:', error)
    ElMessage.error('重启服务失败: ' + error.message)
  } finally {
    service.restarting = false
  }
}

// 启用服务（开机自启）
const enableService = async (service) => {
  service.enabling = true

  try {
    if (!window.electronAPI || !props.connectionId) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      ElMessage.success('演示模式：服务已启用')
      service.enabled = 'enabled'
      return
    }

    const result = await window.electronAPI.ssh.enableSystemctlService(props.connectionId, service.unit)
    if (result.success) {
      ElMessage.success('服务已启用')
      await refreshServices()
    } else {
      ElMessage.error('启用服务失败: ' + (result.message || '未知错误'))
    }
  } catch (error) {
    console.error('启用服务失败:', error)
    ElMessage.error('启用服务失败: ' + error.message)
  } finally {
    service.enabling = false
  }
}

// 禁用服务（取消开机自启）
const disableService = async (service) => {
  service.disabling = true

  try {
    if (!window.electronAPI || !props.connectionId) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      ElMessage.success('演示模式：服务已禁用')
      service.enabled = 'disabled'
      return
    }

    const result = await window.electronAPI.ssh.disableSystemctlService(props.connectionId, service.unit)
    if (result.success) {
      ElMessage.success('服务已禁用')
      await refreshServices()
    } else {
      ElMessage.error('禁用服务失败: ' + (result.message || '未知错误'))
    }
  } catch (error) {
    console.error('禁用服务失败:', error)
    ElMessage.error('禁用服务失败: ' + error.message)
  } finally {
    service.disabling = false
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

// 监听详情 Tab 切换
watch(activeDetailTab, (newTab) => {
  if (newTab === 'status' && selectedService.value && !serviceStatus.value) {
    loadServiceStatus(selectedService.value)
  } else if (newTab === 'logs' && selectedService.value && !serviceLogs.value) {
    loadServiceLogs(selectedService.value)
  }
})

// 监听详情窗口关闭
watch(detailDialogVisible, (newVal) => {
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
    refreshServices()
  }, 10000) // 每 10 秒刷新一次
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
  loadCustomServices()
  refreshServices()
  if (autoRefresh.value) {
    startAutoRefresh()
  }
  document.addEventListener('click', handleClickOutside)
})

// 组件卸载
onUnmounted(() => {
  stopAutoRefresh()
  stopLogsStream()
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.systemctl-manager-tab {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  transition: background-color 0.3s ease;
}

.systemctl-toolbar {
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

.systemctl-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

/* 统计卡片 */
.stats-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 8px;
}

.stat-card {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-info {
  flex: 1;
  min-width: 0;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

/* 不同状态卡片的配色 */
.stat-card-total {
  border-color: rgba(102, 126, 234, 0.2);
}

.stat-card-total:hover {
  border-color: rgba(102, 126, 234, 0.5);
  background: rgba(102, 126, 234, 0.05);
}

.stat-card-total .stat-icon {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.stat-card-total .stat-value {
  color: #667eea;
}

.stat-card-active {
  border-color: rgba(103, 194, 58, 0.2);
}

.stat-card-active:hover {
  border-color: rgba(103, 194, 58, 0.5);
  background: rgba(103, 194, 58, 0.05);
}

.stat-card-active .stat-icon {
  background: linear-gradient(135deg, #67c23a 0%, #85ce61 100%);
  color: white;
}

.stat-card-active .stat-value {
  color: #67c23a;
}

.stat-card-inactive {
  border-color: rgba(144, 147, 153, 0.2);
}

.stat-card-inactive:hover {
  border-color: rgba(144, 147, 153, 0.5);
  background: rgba(144, 147, 153, 0.05);
}

.stat-card-inactive .stat-icon {
  background: linear-gradient(135deg, #909399 0%, #b1b3b8 100%);
  color: white;
}

.stat-card-inactive .stat-value {
  color: #909399;
}

.stat-card-failed {
  border-color: rgba(245, 108, 108, 0.2);
}

.stat-card-failed:hover {
  border-color: rgba(245, 108, 108, 0.5);
  background: rgba(245, 108, 108, 0.05);
}

.stat-card-failed .stat-icon {
  background: linear-gradient(135deg, #f56c6c 0%, #f78989 100%);
  color: white;
}

.stat-card-failed .stat-value {
  color: #f56c6c;
}

.stat-card-enabled {
  border-color: rgba(64, 158, 255, 0.2);
}

.stat-card-enabled:hover {
  border-color: rgba(64, 158, 255, 0.5);
  background: rgba(64, 158, 255, 0.05);
}

.stat-card-enabled .stat-icon {
  background: linear-gradient(135deg, #409eff 0%, #66b1ff 100%);
  color: white;
}

.stat-card-enabled .stat-value {
  color: #409eff;
}

/* 分组视图 */
.services-group-view {
  overflow-y: auto;
  padding: 12px;
}

.service-group-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.service-group-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-secondary);
  cursor: pointer;
  transition: background-color 0.2s ease;
  user-select: none;
}

.group-header:hover {
  background: var(--hover-bg);
}

.group-header-left {
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

.group-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.group-services {
  border-top: 1px solid var(--border-color);
}

.service-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color-light);
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--bg-primary);
}

.service-item:last-child {
  border-bottom: none;
}

.service-item:hover {
  background: var(--hover-bg);
}

.service-item.selected {
  background: rgba(102, 126, 234, 0.1);
  border-left: 3px solid var(--color-primary);
}

.service-item-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 2;
  min-width: 0;
}

.service-item-middle {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 3;
  min-width: 0;
  padding: 0 12px;
}

.service-item-right {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.service-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.service-unit-small {
  font-family: 'Cascadia Code', 'JetBrains Mono', monospace;
  font-size: 11px;
  padding: 2px 6px;
  background: rgba(102, 126, 234, 0.1);
  border-radius: 4px;
  color: #667eea;
  flex-shrink: 0;
}

.service-description {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 展开/收起动画 */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
  max-height: 2000px;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}

.services-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border-radius: 8px;
  overflow: hidden;
  min-height: 0;
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

.systemctl-table {
  background: var(--bg-primary) !important;
}

.systemctl-table :deep(.el-table__header) {
  background: var(--bg-secondary) !important;
}

.systemctl-table :deep(.el-table__header th) {
  background: var(--bg-secondary) !important;
  color: var(--text-primary) !important;
  font-weight: 600;
}

.systemctl-table :deep(.el-table__row) {
  background: var(--card-bg) !important;
  transition: background-color 0.3s ease;
  cursor: pointer;
}

.systemctl-table :deep(.el-table__row:hover) {
  background: var(--hover-bg) !important;
}

.systemctl-table :deep(.el-table__row.el-table__row--striped) {
  background: var(--bg-secondary) !important;
}

.systemctl-table :deep(.el-table__row.el-table__row--striped:hover) {
  background: var(--hover-bg) !important;
}

.systemctl-table :deep(td) {
  color: var(--text-primary) !important;
  border-color: var(--border-color-light) !important;
}

.unit-name {
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

/* 服务详情 */
.service-detail {
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
  min-width: 100px;
  font-size: 13px;
}

.detail-value {
  color: var(--text-primary);
  font-size: 13px;
  flex: 1;
  word-break: break-all;
}

/* 状态信息 */
.status-section {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.status-toolbar {
  display: flex;
  gap: 8px;
}

.status-content {
  flex: 1;
  overflow: hidden;
  background: #1e1e1e;
  border-radius: 6px;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.status-pre {
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
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
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

/* 日志颜色高亮 */
.logs-pre :deep(.log-error) {
  color: #ff4444;
}

.logs-pre :deep(.log-warn) {
  color: #ffaa00;
}

.logs-pre :deep(.log-info) {
  color: #44dd44;
}

.logs-pre :deep(.log-debug) {
  color: #4ecdc4;
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

/* 自定义常用服务对话框 */
.custom-services-dialog {
  max-height: 60vh;
  overflow-y: auto;
}

.dialog-section {
  margin-bottom: 8px;
}

.dialog-section .section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.services-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
  min-height: 60px;
}

.add-service-form {
  display: flex;
  gap: 8px;
  align-items: center;
}

.dialog-tips {
  margin-top: 8px;
}

.dialog-tips ul {
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-secondary);
}

.dialog-tips li {
  margin-bottom: 4px;
}

/* 服务详情对话框 */
:deep(.service-detail-dialog) {
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

:deep(.service-detail-dialog .el-dialog__header) {
  padding: 16px 20px !important;
  border-bottom: 1px solid var(--border-color) !important;
}

:deep(.service-detail-dialog .el-dialog__body) {
  padding: 0 !important;
  height: calc(75vh - 60px) !important;
  overflow: hidden !important;
}

:deep(.service-detail-dialog .el-tabs) {
  height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
}

:deep(.service-detail-dialog .el-tabs__content) {
  flex: 1 !important;
  overflow-y: auto !important;
  padding: 16px 20px !important;
}

:deep(.service-detail-dialog .el-tab-pane) {
  height: 100% !important;
}
</style>
