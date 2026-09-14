import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAgentSession, DefaultResourceLoader, defineTool, ModelRuntime, SessionManager } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

const input = JSON.parse(await new Promise((resolve) => {
  let data = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => { data += chunk })
  process.stdin.on('end', () => resolve(data))
}))

const config = input.config || {}
const baseUrl = String(config.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '')
const providerId = 'sunbird-deepseek'
const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sunbird-pi-'))
const modelsPath = path.join(runtimeDir, 'models.json')
const authPath = path.join(runtimeDir, 'auth.json')

await fs.writeFile(modelsPath, JSON.stringify({
  providers: {
    [providerId]: {
      baseUrl,
      api: 'openai-completions',
      authHeader: true,
      models: [
        {
          id: 'deepseek-v4-flash',
          name: 'DeepSeek V4 Flash',
          reasoning: true,
          contextWindow: 128000,
          maxTokens: 8192,
          compat: { thinkingFormat: 'deepseek' }
        },
        {
          id: 'deepseek-v4-pro',
          name: 'DeepSeek V4 Pro',
          reasoning: true,
          contextWindow: 128000,
          maxTokens: 16384,
          compat: { thinkingFormat: 'deepseek' }
        }
      ]
    }
  }
}, null, 2), 'utf8')
await fs.writeFile(authPath, '{}', 'utf8')

const backendFetch = async (route, options = {}) => {
  const response = await fetch(`http://127.0.0.1:${input.backendPort || 5409}${route}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.authToken || ''}`,
      ...(options.headers || {})
    }
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || data.msg || `HTTP ${response.status}`)
  return data.data
}

const searchTool = defineTool({
  name: 'search_douyin_content',
  label: '搜索抖音内容',
  description: '按关键词创建抖音综合内容搜索任务。',
  parameters: Type.Object({
    keyword: Type.String({ minLength: 1 }),
    targetCount: Type.Optional(Type.Integer({ minimum: 10, maximum: 100 }))
  }),
  execute: async (_id, params) => ({
    content: [{ type: 'text', text: JSON.stringify(await backendFetch('/benchmark/douyin/content-search', {
      method: 'POST', body: JSON.stringify({ keyword: params.keyword, targetCount: params.targetCount || 50 })
    })) }],
    details: {}
  })
})

const listVideosTool = defineTool({
  name: 'list_benchmark_videos',
  label: '读取对标作品',
  description: '读取已经采集的对标作品，用于内容分析。',
  parameters: Type.Object({
    keyword: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 }))
  }),
  execute: async (_id, params) => {
    const query = new URLSearchParams()
    if (params.keyword) query.set('keyword', params.keyword)
    query.set('limit', String(params.limit || 50))
    return { content: [{ type: 'text', text: JSON.stringify(await backendFetch(`/benchmark/douyin/videos?${query}`)) }], details: {} }
  }
})

const saveAnalysisTool = defineTool({
  name: 'save_benchmark_analysis',
  label: '保存对标作品分析',
  description: '将 PI Agent生成的结构化作品拆解保存到对标库。仅在完成可靠分析后调用。',
  parameters: Type.Object({
    videoId: Type.Integer({ minimum: 1 }),
    summary: Type.String(),
    hook: Type.String(),
    core_viewpoint: Type.String(),
    pain_points: Type.Array(Type.String()),
    viral_points: Type.Array(Type.String()),
    reusable_points: Type.Array(Type.String()),
    script_suggestions: Type.Array(Type.String())
  }),
  execute: async (_id, params) => ({
    content: [{ type: 'text', text: JSON.stringify(await backendFetch(`/benchmark/douyin/videos/${params.videoId}/pi-analysis`, {
      method: 'POST', body: JSON.stringify(params)
    })) }],
    details: {}
  })
})

try {
  const modelRuntime = await ModelRuntime.create({ authPath, modelsPath })
  await modelRuntime.setRuntimeApiKey(providerId, config.apiKey)
  const modelId = config.model || 'deepseek-v4-flash'
  const model = modelRuntime.getModel(providerId, modelId)
  if (!model) throw new Error(`PI Agent无法加载模型：${modelId}`)
  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    systemPromptOverride: () => '你是 Sunbird OS 的中文自媒体运营 Agent。只使用提供的工具，不得编造搜索或作品数据。'
  })
  await resourceLoader.reload()
  const { session } = await createAgentSession({
    modelRuntime,
    model,
    thinkingLevel: config.thinkingLevel || 'off',
    noTools: 'builtin',
    customTools: [searchTool, listVideosTool, saveAnalysisTool],
    sessionManager: SessionManager.inMemory(),
    resourceLoader
  })
  let output = ''
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') output += event.assistantMessageEvent.delta
  })
  await session.prompt(String(input.prompt || ''))
  await session.agent.waitForIdle()
  unsubscribe()
  session.dispose()
  process.stdout.write(JSON.stringify({ ok: true, content: output }))
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error.message || String(error) }))
  process.exitCode = 1
} finally {
  await fs.rm(runtimeDir, { recursive: true, force: true })
}
