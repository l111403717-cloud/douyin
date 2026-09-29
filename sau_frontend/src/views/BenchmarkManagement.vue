<template>
  <div class="benchmark-management">
    <div class="page-header">
      <h1>抖音对标管理</h1>
    </div>

    <el-card shadow="never" class="agent-card">
      <template #header><div class="card-header"><span>PI Agent</span><el-button size="small" @click="savePiSettings">保存模型配置</el-button></div></template>
      <el-form label-width="90px">
        <div class="auto-options">
          <el-form-item label="Base URL"><el-input v-model="piSettings.baseUrl" style="width: 260px" placeholder="https://..." /></el-form-item>
          <el-form-item label="模型">
            <el-select
              v-model="piSettings.model"
              filterable
              allow-create
              default-first-option
              style="width: 220px"
              placeholder="选择或输入模型"
            >
              <el-option
                v-for="item in piModelOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="API Key"><el-input v-model="piSettings.apiKey" type="password" show-password style="width: 240px" placeholder="已配置，留空保持不变" /></el-form-item>
          <el-button type="primary" plain :loading="testingPiConnection" @click="testPiConnection">测试可用模型</el-button>
        </div>
      </el-form>
      <div class="add-row">
        <el-input v-model="piPrompt" placeholder="例如：搜索 50 条个人成长内容，并总结最常见的开头钩子" @keyup.enter="runPiAgent" />
        <el-button type="primary" :loading="piRunning" @click="runPiAgent">运行 Agent</el-button>
      </div>
      <el-alert v-if="piResult" :title="piResult" type="success" :closable="false" class="agent-result" />
    </el-card>

    <el-card shadow="never" class="search-card">
      <template #header><div class="card-header"><span>内容搜索</span><div><el-button size="small" @click="openDouyinLogin">打开抖音窗口</el-button><el-button size="small" type="primary" plain @click="syncDouyinSession">验证完成并同步</el-button><el-tag v-if="searchTask" :type="searchTask.status === 'success' ? 'success' : 'info'">{{ searchTask.status }}</el-tag></div></div></template>
      <div class="add-row">
        <el-input v-model="contentKeyword" placeholder="例如：AI 编程、个人 IP、知识付费" clearable />
        <el-input-number v-model="contentTargetCount" :min="10" :max="100" />
        <el-button type="primary" :loading="contentSearching" @click="startContentSearch">搜索内容</el-button>
      </div>
      <el-progress v-if="contentSearching" :percentage="Math.min(99, Math.round((contentResults.length / contentTargetCount) * 100))" />
      <el-table v-if="contentResults.length" :data="contentResults" class="search-results" style="width: 100%">
        <el-table-column prop="source_rank" label="#" width="60" />
        <el-table-column label="内容" min-width="420">
          <template #default="scope"><div class="search-content"><el-image v-if="scope.row.cover_url" :src="scope.row.cover_url" fit="cover" class="search-cover" /><div><div class="search-title">{{ scope.row.title }}</div><div class="search-author">{{ scope.row.author_name || '未知作者' }} · {{ scope.row.like_count || '暂无获赞数' }}</div></div></div></template>
        </el-table-column>
        <el-table-column label="类型" width="90"><template #default="scope">{{ scope.row.video_type === 'note' ? '图文' : '视频' }}</template></el-table-column>
        <el-table-column label="操作" width="120"><template #default="scope"><el-link :href="scope.row.video_url" target="_blank" type="primary">打开作品</el-link></template></el-table-column>
      </el-table>
      <el-empty v-else-if="!contentSearching" description="输入关键词搜索抖音内容" :image-size="80" />
    </el-card>

    <el-card shadow="never" class="add-card">
      <el-form label-width="100px">
        <el-form-item label="主页链接">
          <div class="add-row">
            <el-input
              v-model="homepageUrl"
              placeholder="粘贴抖音对标账号主页链接"
              clearable
            />
            <el-button type="primary" :loading="adding" @click="addAccount">
              添加并同步
            </el-button>
          </div>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="auto-card">
      <template #header>
        <div class="card-header">
          <span>自动找对标</span>
          <el-button type="primary" :loading="autoDiscovering" @click="autoDiscoverAccounts">
            开始寻找并同步
          </el-button>
        </div>
      </template>
      <el-form label-width="100px">
        <el-form-item label="对标关键词">
          <el-input
            v-model="autoKeywords"
            type="textarea"
            :rows="3"
            placeholder="例如：AI 自媒体、知识付费、个人IP。多个关键词用逗号或换行分隔"
          />
        </el-form-item>
        <div class="auto-options">
          <el-form-item label="找账号数">
            <el-input-number v-model="autoLimit" :min="1" :max="20" />
          </el-form-item>
          <el-form-item label="每号作品数">
            <el-input-number v-model="autoMaxVideos" :min="1" :max="30" />
          </el-form-item>
        </div>
      </el-form>
      <el-alert
        v-if="autoResult"
        :title="`找到 ${autoResult.summary?.found || 0} 个账号，成功同步 ${autoResult.summary?.synced || 0} 个，作品链接 ${autoResult.summary?.videoLinks || 0} 条，失败 ${autoResult.summary?.failed || 0} 个`"
        type="success"
        show-icon
        :closable="false"
      />
      <el-table
        v-if="autoResult?.synced?.length"
        :data="autoResult.synced"
        class="auto-results"
        style="width: 100%"
      >
        <el-table-column label="搜索到的账号" min-width="180">
          <template #default="scope">
            <div class="auto-account-name">{{ scope.row.nickname || '未识别账号' }}</div>
            <el-link :href="scope.row.homepage_url" target="_blank" type="primary">
              打开主页
            </el-link>
          </template>
        </el-table-column>
        <el-table-column label="已同步内容" min-width="420">
          <template #default="scope">
            <div v-if="scope.row.videos?.length" class="content-links">
              <el-link
                v-for="(video, index) in scope.row.videos.slice(0, 5)"
                :key="video.id || video.video_url"
                :href="video.video_url"
                target="_blank"
                type="primary"
                class="content-link"
              >
                {{ video.title || `作品 ${index + 1}` }}
              </el-link>
              <span v-if="scope.row.videos.length > 5" class="more-count">
                另有 {{ scope.row.videos.length - 5 }} 条
              </span>
            </div>
            <span v-else class="empty-content">
              {{ scope.row.contentLoadFailed ? '内容链接读取失败' : '暂未同步到内容链接' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="链接数" width="90" align="center">
          <template #default="scope">{{ scope.row.videos?.length || 0 }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>对标账号</span>
          <el-button :loading="loading" @click="fetchAccounts">刷新</el-button>
        </div>
      </template>

      <el-table :data="accounts" v-loading="loading" style="width: 100%">
        <el-table-column label="账号" min-width="220">
          <template #default="scope">
            <div class="account-cell">
              <el-avatar :src="scope.row.avatar" :size="36">{{ avatarText(scope.row) }}</el-avatar>
              <div>
                <div class="name">{{ scope.row.nickname || '未识别账号' }}</div>
                <el-link :href="scope.row.homepage_url" target="_blank" type="primary">
                  打开主页
                </el-link>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="followers_count" label="关注人" width="140" />
        <el-table-column prop="likes_count" label="粉丝" width="140" />
        <el-table-column prop="received_likes_count" label="获赞" width="140" />
        <el-table-column prop="video_count" label="作品" width="140" />
        <el-table-column prop="synced_video_count" label="已同步作品" width="120" />
        <el-table-column label="状态" width="120">
          <template #default="scope">
            <el-tag :type="scope.row.status === 'success' ? 'success' : scope.row.status === 'failed' ? 'danger' : 'info'">
              {{ statusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="last_sync_at" label="最近同步" width="180" />
        <el-table-column prop="error_message" label="错误" min-width="180" show-overflow-tooltip />
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="scope">
            <el-button size="small" @click="loadVideos(scope.row)">
              {{ selectedAccount?.id === scope.row.id ? '收起' : '作品' }}
            </el-button>
            <el-button size="small" type="primary" :loading="syncingId === scope.row.id" @click="syncAccount(scope.row)">
              同步
            </el-button>
            <el-button
              size="small"
              type="danger"
              plain
              :loading="deletingId === scope.row.id"
              @click="deleteAccount(scope.row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && accounts.length === 0" description="暂无对标账号" />
    </el-card>

    <el-card v-if="selectedAccount" shadow="never" class="videos-card">
      <template #header>
        <div class="card-header">
          <span>{{ selectedAccount.nickname || '对标账号' }} 的近期作品</span>
        </div>
      </template>

      <el-table :data="videos" v-loading="videosLoading" style="width: 100%">
        <el-table-column label="封面" width="100">
          <template #default="scope">
            <el-image
              v-if="scope.row.cover_url"
              :src="scope.row.cover_url"
              fit="cover"
              style="width: 72px; height: 96px; border-radius: 4px;"
            />
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题/文案" min-width="260" show-overflow-tooltip />
        <el-table-column prop="like_count" label="点赞" width="100" />
        <el-table-column label="链接" min-width="220">
          <template #default="scope">
            <el-link :href="scope.row.video_url" target="_blank" type="primary">
              打开作品
            </el-link>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="同步时间" width="180" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="scope">
            <el-button
              size="small"
              type="primary"
              plain
              :loading="analyzingId === scope.row.id"
              @click="openVideoAnalysis(scope.row)"
            >
              拆解
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!videosLoading && videos.length === 0" description="暂无作品数据" />
    </el-card>

    <el-drawer
      v-model="analysisDrawerVisible"
      title="作品内拆解"
      size="520px"
      class="analysis-drawer"
    >
      <div v-loading="analysisLoading" class="analysis-content">
        <template v-if="selectedVideo">
          <section class="analysis-section">
            <div class="section-title">作品基础信息</div>
            <div class="video-summary">
              <el-image
                v-if="selectedVideo.cover_url"
                :src="selectedVideo.cover_url"
                fit="cover"
                class="analysis-cover"
              />
              <div class="video-meta">
                <div class="video-title">{{ selectedVideo.title || '暂无标题/文案' }}</div>
                <el-link :href="selectedVideo.video_url" target="_blank" type="primary">
                  打开原作品
                </el-link>
              </div>
            </div>
          </section>

          <template v-if="videoAnalysis">
            <el-alert
              v-if="videoAnalysis.analysis_type === 'codex_cli'"
              title="当前为 Codex CLI 深度拆解结果，已结合标题、文案、链接、封面和同步数据进行对标分析。"
              type="success"
              show-icon
              :closable="false"
              class="analysis-tip"
            />
            <el-alert
              v-else-if="videoAnalysis.analysis_type === 'metadata_fallback'"
              title="Codex CLI 暂未返回可用结果，当前展示规则兜底拆解。可稍后点击“重新拆解”再试。"
              type="warning"
              show-icon
              :closable="false"
              class="analysis-tip"
            />
            <el-alert
              v-else-if="videoAnalysis.analysis_type === 'metadata'"
              title="当前为基于已同步标题/封面/链接的元数据拆解，深度版可继续接入评论、详情页和视频转写。"
              type="info"
              show-icon
              :closable="false"
              class="analysis-tip"
            />

            <section class="analysis-section">
              <div class="section-title">内容结构拆解</div>
              <el-descriptions :column="1" border>
                <el-descriptions-item label="开头钩子">
                  {{ videoAnalysis.hook || '-' }}
                </el-descriptions-item>
                <el-descriptions-item label="核心观点">
                  {{ videoAnalysis.core_viewpoint || '-' }}
                </el-descriptions-item>
                <el-descriptions-item label="总结">
                  {{ videoAnalysis.summary || '-' }}
                </el-descriptions-item>
              </el-descriptions>
            </section>

            <section class="analysis-section">
              <div class="section-title">爆点分析</div>
              <div class="tag-list">
                <el-tag
                  v-for="item in videoAnalysis.viral_points"
                  :key="item"
                  type="warning"
                  effect="plain"
                >
                  {{ item }}
                </el-tag>
              </div>
              <el-empty
                v-if="!videoAnalysis.viral_points?.length"
                description="暂无爆点分析"
                :image-size="80"
              />
            </section>

            <section class="analysis-section">
              <div class="section-title">人群痛点</div>
              <ul class="analysis-list">
                <li v-for="item in videoAnalysis.pain_points" :key="item">{{ item }}</li>
              </ul>
            </section>

            <section class="analysis-section">
              <div class="section-title">可复刻点</div>
              <ul class="analysis-list">
                <li v-for="item in videoAnalysis.reusable_points" :key="item">{{ item }}</li>
              </ul>
            </section>

            <section class="analysis-section">
              <div class="section-title">脚本复刻建议</div>
              <div class="script-list">
                <div
                  v-for="(item, index) in videoAnalysis.script_suggestions"
                  :key="item"
                  class="script-item"
                >
                  <span class="script-index">{{ index + 1 }}</span>
                  <span>{{ item }}</span>
                </div>
              </div>
            </section>

            <div class="drawer-actions">
              <el-button
                type="primary"
                :loading="analysisLoading"
                @click="regenerateVideoAnalysis"
              >
                重新拆解
              </el-button>
            </div>
          </template>

          <el-empty v-else-if="!analysisLoading" description="暂无拆解数据" />
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { benchmarkApi } from '@/api/benchmark'
import { http } from '@/utils/request'

const homepageUrl = ref('')
const autoKeywords = ref('')
const autoLimit = ref(5)
const autoMaxVideos = ref(10)
const autoDiscovering = ref(false)
const autoResult = ref(null)
const loading = ref(false)
const adding = ref(false)
const syncingId = ref(null)
const deletingId = ref(null)
const accounts = ref([])
const selectedAccount = ref(null)
const videos = ref([])
const videosLoading = ref(false)
const analysisDrawerVisible = ref(false)
const analysisLoading = ref(false)
const analyzingId = ref(null)
const selectedVideo = ref(null)
const videoAnalysis = ref(null)
const contentKeyword = ref('')
const contentTargetCount = ref(50)
const contentSearching = ref(false)
const searchTask = ref(null)
const contentResults = ref([])
const piSettings = ref({
  baseUrl: 'https://tntapi.com/v1',
  model: 'deepseek-v4-flash',
  apiKey: ''
})
const piModelOptions = ref([
  { label: 'DeepSeek V4 Flash', value: 'deepseek-v4-flash' },
  { label: 'DeepSeek V4 Pro', value: 'deepseek-v4-pro' },
  { label: 'DeepSeek V4.1 Flash', value: 'deepseek-v4.1-flash' }
])
const testingPiConnection = ref(false)
const piPrompt = ref('')
const piResult = ref('')
const piRunning = ref(false)

const avatarText = (account) => {
  return (account.nickname || '抖').slice(0, 1)
}

const statusText = (status) => {
  const map = {
    success: '已同步',
    failed: '失败',
    pending: '待同步'
  }
  return map[status] || status || '未知'
}

const fetchAccounts = async () => {
  loading.value = true
  try {
    const response = await benchmarkApi.getDouyinAccounts()
    accounts.value = response.data || []
  } catch (error) {
    console.error('获取对标账号失败:', error)
    ElMessage.error('获取对标账号失败')
  } finally {
    loading.value = false
  }
}

const addAccount = async () => {
  if (!homepageUrl.value.trim()) {
    ElMessage.warning('请先粘贴抖音主页链接')
    return
  }
  adding.value = true
  try {
    await benchmarkApi.addDouyinAccount(homepageUrl.value.trim())
    ElMessage.success('对标账号已同步')
    homepageUrl.value = ''
    await fetchAccounts()
  } catch (error) {
    console.error('添加对标账号失败:', error)
    ElMessage.error('添加对标账号失败')
  } finally {
    adding.value = false
  }
}

const autoDiscoverAccounts = async () => {
  if (!autoKeywords.value.trim()) {
    ElMessage.warning('请先填写对标关键词')
    return
  }
  autoDiscovering.value = true
  autoResult.value = null
  try {
    const response = await benchmarkApi.autoDiscoverDouyinAccounts({
      keywords: autoKeywords.value,
      limit: autoLimit.value,
      maxVideos: autoMaxVideos.value
    })
    const result = response.data || {}
    const syncedAccounts = await Promise.all((result.synced || []).map(async (account) => {
      try {
        const videoResponse = await benchmarkApi.getDouyinVideos(account.id)
        return { ...account, videos: videoResponse.data || [] }
      } catch (error) {
        console.error(`读取账号 ${account.id} 的作品失败:`, error)
        return { ...account, videos: [], contentLoadFailed: true }
      }
    }))
    const videoLinks = syncedAccounts.reduce((total, account) => total + account.videos.length, 0)
    autoResult.value = {
      ...result,
      synced: syncedAccounts,
      summary: { ...(result.summary || {}), videoLinks }
    }
    const summary = autoResult.value.summary || {}
    ElMessage.success(`自动同步完成：${summary.synced || 0} 个账号，${summary.videoLinks || 0} 条作品链接`)
    await fetchAccounts()
  } catch (error) {
    console.error('自动找对标失败:', error)
    ElMessage.error('自动找对标失败')
  } finally {
    autoDiscovering.value = false
  }
}

const startContentSearch = async () => {
  if (!contentKeyword.value.trim()) {
    ElMessage.warning('请先填写内容关键词')
    return
  }
  contentSearching.value = true
  contentResults.value = []
  try {
    const response = await benchmarkApi.createContentSearch({ keyword: contentKeyword.value.trim(), targetCount: contentTargetCount.value })
    const taskId = response.data?.task_id || response.data?.taskId
    if (!taskId) throw new Error('搜索任务创建失败')
    let finished = false
    while (!finished) {
      const [taskResponse, resultResponse] = await Promise.all([
        benchmarkApi.getContentSearchTask(taskId),
        benchmarkApi.getContentSearchResults(taskId)
      ])
      searchTask.value = taskResponse.data || null
      contentResults.value = resultResponse.data || []
      finished = ['success', 'failed', 'stopped'].includes(searchTask.value?.status)
      if (!finished) await new Promise(resolve => setTimeout(resolve, 1200))
    }
    if (searchTask.value?.status === 'failed') ElMessage.error(searchTask.value.error_message || '内容搜索失败')
    else ElMessage.success(`搜索完成，共找到 ${contentResults.value.length} 条内容`)
  } catch (error) {
    console.error('内容搜索失败:', error)
    ElMessage.error(error.message || '内容搜索失败')
  } finally {
    contentSearching.value = false
  }
}

const openDouyinLogin = async () => {
  try {
    if (!window.sunbirdDesktop?.openDouyin) {
      ElMessage.warning('内置抖音窗口仅在 Sunbird OS 桌面版中可用')
      return
    }
    await window.sunbirdDesktop.openDouyin()
    ElMessage.success('已打开 Sunbird OS 抖音窗口')
  } catch (error) {
    ElMessage.error(error.message || '打开抖音验证窗口失败')
  }
}

const syncDouyinSession = async () => {
  try {
    if (!window.sunbirdDesktop?.syncDouyinSession) {
      ElMessage.warning('会话同步仅在 Sunbird OS 桌面版中可用')
      return
    }
    const response = await window.sunbirdDesktop.syncDouyinSession()
    ElMessage.success(`会话已同步，共 ${response.data?.cookieCount || 0} 个 Cookie`)
  } catch (error) {
    ElMessage.error(error.message || '同步抖音会话失败')
  }
}

const testPiConnection = async () => {
  if (!piSettings.value.baseUrl) {
    return ElMessage.warning('请输入 Base URL')
  }
  testingPiConnection.value = true
  try {
    const res = await http.post('/api/test-llm-models', {
      baseUrl: piSettings.value.baseUrl,
      apiKey: piSettings.value.apiKey
    })
    if (res?.data?.cleanedApiKey) {
      piSettings.value.apiKey = res.data.cleanedApiKey
    }
    const models = res?.data?.models || []
    if (models.length > 0) {
      piModelOptions.value = models.map((m) => ({ label: m, value: m }))
      if (!models.includes(piSettings.value.model)) {
        piSettings.value.model = models[0]
      }
      ElMessage.success(res.message || `测试成功，已读取 ${models.length} 个可用模型`)
    } else {
      ElMessage.success('连接成功')
    }
  } catch (err) {
    ElMessage.error(err.message || '连接失败，请检查 Base URL 和 API Key')
  } finally {
    testingPiConnection.value = false
  }
}

const loadPiSettings = async () => {
  if (!window.sunbirdDesktop?.getPiSettings) return
  const settings = await window.sunbirdDesktop.getPiSettings()
  if (settings) {
    piSettings.value = {
      ...piSettings.value,
      ...settings,
      apiKey: settings.apiKey || piSettings.value.apiKey || ''
    }
    if (settings.model && !piModelOptions.value.some((item) => item.value === settings.model)) {
      piModelOptions.value.push({ label: settings.model, value: settings.model })
    }
  }
}

const savePiSettings = async () => {
  if (piSettings.value.apiKey && piSettings.value.apiKey.includes('sk-')) {
    const match = piSettings.value.apiKey.match(/sk-[a-zA-Z0-9_\-]+/)
    if (match) piSettings.value.apiKey = match[0]
  }
  if (!window.sunbirdDesktop?.savePiSettings) {
    ElMessage.success('PI Agent 配置已在网页端更新')
    return
  }
  await window.sunbirdDesktop.savePiSettings(piSettings.value)
  ElMessage.success('PI Agent 模型配置已安全保存')
}

const runPiAgent = async () => {
  if (!piPrompt.value.trim()) return ElMessage.warning('请输入 Agent任务')
  if (!window.sunbirdDesktop?.piPrompt) return ElMessage.warning('PI Agent仅在 Sunbird OS桌面版中可用')
  piRunning.value = true
  piResult.value = ''
  try {
    const result = await window.sunbirdDesktop.piPrompt({ prompt: piPrompt.value.trim(), authToken: localStorage.getItem('token') || '' })
    piResult.value = result.content || '任务已完成'
  } catch (error) {
    ElMessage.error(error.message || 'PI Agent运行失败')
  } finally {
    piRunning.value = false
  }
}

const syncAccount = async (account) => {
  syncingId.value = account.id
  try {
    const response = await benchmarkApi.syncDouyinAccount(account.id)
    const sync = response.data?.sync || {}
    ElMessage.success(`同步完成，新增 ${sync.inserted || 0} 条，更新 ${sync.updated || 0} 条`)
    await fetchAccounts()
    if (selectedAccount.value?.id === account.id) {
      await fetchVideosForAccount(account)
    }
  } catch (error) {
    console.error('同步失败:', error)
    ElMessage.error('同步失败')
    await fetchAccounts()
  } finally {
    syncingId.value = null
  }
}

const deleteAccount = async (account) => {
  try {
    await ElMessageBox.confirm(
      `确定删除“${account.nickname || '该对标账号'}”吗？同时会清空其 ${account.synced_video_count || 0} 条作品以及相关拆解和观点雷达记录。`,
      '删除对标',
      {
        confirmButtonText: '删除并清空作品',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch (action) {
    if (action === 'cancel' || action === 'close') return
    throw action
  }

  deletingId.value = account.id
  try {
    const response = await benchmarkApi.deleteDouyinAccount(account.id)
    const result = response.data || {}
    if (selectedAccount.value?.id === account.id) {
      selectedAccount.value = null
      videos.value = []
      selectedVideo.value = null
      videoAnalysis.value = null
      analysisDrawerVisible.value = false
    }
    if (autoResult.value?.synced) {
      autoResult.value.synced = autoResult.value.synced.filter((item) => item.id !== account.id)
    }
    await fetchAccounts()
    ElMessage.success(`已删除对标并清空 ${result.deleted_videos || 0} 条作品`)
  } catch (error) {
    console.error('删除对标失败:', error)
    ElMessage.error('删除对标失败')
  } finally {
    deletingId.value = null
  }
}

const fetchVideosForAccount = async (account) => {
  videosLoading.value = true
  try {
    const response = await benchmarkApi.getDouyinVideos(account.id)
    videos.value = response.data || []
  } catch (error) {
    console.error('获取作品失败:', error)
    ElMessage.error('获取作品失败')
  } finally {
    videosLoading.value = false
  }
}

const loadVideos = async (account) => {
  if (selectedAccount.value?.id === account.id) {
    selectedAccount.value = null
    videos.value = []
    return
  }

  selectedAccount.value = account
  await fetchVideosForAccount(account)
}

const openVideoAnalysis = async (video) => {
  selectedVideo.value = video
  videoAnalysis.value = null
  analysisDrawerVisible.value = true
  analysisLoading.value = true
  analyzingId.value = video.id
  try {
    const response = await benchmarkApi.createDouyinVideoAnalysis(video.id)
    videoAnalysis.value = response.data || null
  } catch (error) {
    console.error('作品拆解失败:', error)
    ElMessage.error('作品拆解失败')
  } finally {
    analysisLoading.value = false
    analyzingId.value = null
  }
}

const regenerateVideoAnalysis = async () => {
  if (!selectedVideo.value) return
  analysisLoading.value = true
  analyzingId.value = selectedVideo.value.id
  try {
    const response = await benchmarkApi.createDouyinVideoAnalysis(selectedVideo.value.id, true)
    videoAnalysis.value = response.data || null
    ElMessage.success('拆解已更新')
  } catch (error) {
    console.error('重新拆解失败:', error)
    ElMessage.error('重新拆解失败')
  } finally {
    analysisLoading.value = false
    analyzingId.value = null
  }
}

onMounted(() => {
  fetchAccounts()
  loadPiSettings()
})
</script>

<style lang="scss" scoped>
.benchmark-management {
  .page-header {
    margin-bottom: 20px;

    h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
  }

  .add-card,
  .agent-card,
  .search-card,
  .auto-card,
  .videos-card {
    margin-bottom: 16px;
  }

  .add-row {
    display: flex;
    width: 100%;
    gap: 12px;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .auto-options {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }

  .auto-results {
    margin-top: 12px;
  }

  .search-results { margin-top: 14px; }
  .agent-result { margin-top: 14px; white-space: pre-wrap; }
  .search-content { display: flex; gap: 10px; align-items: center; min-width: 0; }
  .search-cover { width: 48px; height: 64px; border-radius: 4px; flex: 0 0 auto; }
  .search-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .search-author { color: #909399; font-size: 12px; margin-top: 5px; }

  .auto-account-name {
    margin-bottom: 4px;
    font-weight: 600;
  }

  .content-links {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 6px 0;
  }

  .content-link {
    display: block;
    max-width: 100%;

    :deep(.el-link__inner) {
      display: block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .more-count,
  .empty-content {
    color: #909399;
    font-size: 13px;
  }

  .account-cell {
    display: flex;
    align-items: center;
    gap: 12px;

    .name {
      font-weight: 600;
      margin-bottom: 4px;
    }
  }

  .analysis-content {
    min-height: 320px;
  }

  .analysis-section {
    margin-bottom: 20px;
  }

  .section-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 12px;
    color: #303133;
  }

  .video-summary {
    display: flex;
    gap: 12px;
  }

  .analysis-cover {
    width: 92px;
    height: 124px;
    border-radius: 6px;
    flex: 0 0 auto;
  }

  .video-meta {
    min-width: 0;
  }

  .video-title {
    font-weight: 600;
    line-height: 1.5;
    margin-bottom: 8px;
    word-break: break-word;
  }

  .analysis-tip {
    margin-bottom: 18px;
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .analysis-list {
    margin: 0;
    padding-left: 20px;

    li {
      line-height: 1.7;
      margin-bottom: 6px;
    }
  }

  .script-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .script-item {
    display: flex;
    gap: 10px;
    line-height: 1.6;
    padding: 10px 12px;
    background: #f5f7fa;
    border-radius: 6px;
  }

  .script-index {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #409eff;
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    font-size: 12px;
  }

  .drawer-actions {
    display: flex;
    justify-content: flex-end;
    padding-top: 8px;
  }
}
</style>
