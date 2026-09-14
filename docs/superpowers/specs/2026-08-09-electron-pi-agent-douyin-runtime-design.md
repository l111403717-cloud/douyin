# Electron + WebContentsView + PI Agent 抖音运行时设计

## 1. 目标

Sunbird OS 使用 Electron 内置抖音子窗口完成登录、验证码和人工浏览；使用 Playwright完成批量内容搜索；使用 PI Agent编排工具并承担后续 AI分析。PI Agent拥有独立模型配置，第一版优先支持 DeepSeek当前官方 API，同时提供自定义 OpenAI-compatible Provider。

## 2. 总体架构

```text
Vue Renderer
  ├── 对标内容搜索与结果展示
  ├── PI Agent 对话与工具执行时间线
  └── 模型 Provider 设置

Electron Main
  ├── WebContentsView 抖音子窗口
  ├── persist:douyin 持久化会话
  ├── PI Agent Runtime
  └── 白名单 IPC Bridge

Python Backend
  ├── Playwright 内容采集
  ├── SQLite 任务与作品数据
  ├── 转写、分析结果存储与发布能力
  └── Tool/MCP API
```

Electron 31 不使用已经弃用的 BrowserView，改用 WebContentsView。

## 3. 抖音内置浏览器

- Electron创建属于 Sunbird OS 的独立抖音子窗口。
- 子窗口由 BrowserWindow承载 WebContentsView。
- WebContentsView使用固定 `partition: persist:douyin`。
- `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`。
- 仅允许导航到抖音及其必要资源域名；外部导航默认阻止。
- 重复打开时聚焦已有窗口，不创建多个会话窗口。
- 主应用退出时关闭子窗口。
- 网页开发模式没有 Electron IPC时，页面明确提示桌面版能力不可用。

## 4. Electron 与 Playwright 会话同步

WebContentsView负责人工登录和验证码。Playwright负责后台批量搜索，不直接通过 CDP控制 WebContentsView。

流程：

1. 用户在 `persist:douyin` 会话中登录或完成验证。
2. Electron通过 session API导出抖音 Cookie。
3. Electron调用后端会话同步接口，将 Cookie转成 Playwright storage state。
4. Playwright使用该 state执行搜索。
5. 触发验证码时任务进入 `paused_verification`。
6. Electron打开或聚焦抖音窗口。
7. 用户验证完成后点击“验证完成并继续”。
8. Electron重新同步 Cookie，后端恢复任务。

Cookie同步接口只接受抖音域 Cookie，不接受任意域名数据。

## 5. PI Agent Runtime

PI Agent运行在 Electron Node侧，采用 agent core，不启用 Coding Agent默认的文件写入、Shell执行和任意网络工具。

第一版工具白名单：

- `open_douyin_view`
- `sync_douyin_session`
- `search_douyin_content`
- `get_search_status`
- `resume_content_search`
- `list_benchmark_videos`
- `import_benchmark_videos`
- `analyze_benchmark_video`
- `generate_topic_angles`
- `generate_script`

搜索、读取和分析可自动执行。批量导入、删除和发布需要用户确认。网页内容属于不可信输入，不得直接提升为 Agent系统指令。

## 6. 独立模型配置

PI Agent不依赖现有 Hermes配置。设置项包括：

- Provider
- Base URL
- API Key
- Model
- Thinking mode
- Reasoning effort
- Maximum output tokens
- Timeout

第一版 Provider：

- DeepSeek
- 自定义 OpenAI-compatible

后续以预设形式增加阿里云百炼、智谱、Moonshot和硅基流动。

API Key不传给 Playwright采集器。桌面版优先使用操作系统安全存储；无法使用安全存储时需明确提示本机配置存储风险。

## 7. DeepSeek 官方接口适配

第一版按 2026-08-09 DeepSeek官方文档实现：

```text
Base URL: https://api.deepseek.com
Endpoint: POST /chat/completions
Authorization: Bearer <API_KEY>
```

默认模型：

- 普通对话和工具编排：`deepseek-v4-flash`
- 深度分析：`deepseek-v4-pro`

旧模型名 `deepseek-chat` 和 `deepseek-reasoner` 不作为默认值。

非思考模式：

```json
{"thinking":{"type":"disabled"}}
```

深度分析模式：

```json
{
  "thinking":{"type":"enabled"},
  "reasoning_effort":"high"
}
```

工具调用采用 OpenAI风格 `tools`、`tool_choice` 和 `tool_calls`。工具参数执行前必须通过 JSON Schema校验。

结构化分析使用：

```json
{"response_format":{"type":"json_object"}}
```

提示词中必须同时明确要求输出 JSON。响应读取 `choices[0].message.content`；思考内容如果存在，从 `reasoning_content`读取但不保存到公开分析结果。

## 8. AI 分析迁移

新分析默认使用 `analysis_runtime=pi_agent`。现有 Codex/Hermes分析保留用于历史兼容，不自动重算。

分析流程：

```text
作品元数据/转写
  → PI Agent读取创作者定位与历史内容
  → 选择分析模型
  → 调用必要工具
  → 生成结构化 JSON
  → 后端校验 Schema
  → 保存现有分析表
```

PI Agent不可用时明确返回配置或连接错误，不静默切换 Provider。

## 9. 错误与状态

搜索任务状态：

- `pending`
- `running`
- `paused_verification`
- `success`
- `failed`
- `stopped`

PI Agent工具执行记录包含工具名、开始时间、结束时间、状态和精简结果。API Key、Cookie、完整思考内容不得写入日志。

## 10. 测试范围

- WebContentsView窗口单例、导航白名单和持久化 partition。
- Electron Cookie导出及后端 storage state转换。
- 验证暂停、人工处理和任务恢复。
- DeepSeek连接测试、非流式响应、流式响应和错误响应。
- Function Calling参数 Schema校验。
- JSON分析结果校验与保存。
- PI Agent危险工具确认机制。
- 网页版缺少 Electron IPC时的降级提示。

## 11. 第一版范围

第一版实现 WebContentsView抖音窗口、Cookie同步、验证码暂停恢复、PI Agent Core、DeepSeek与自定义 OpenAI-compatible Provider、搜索编排及对标作品 AI拆解。自动发布、多 Agent协作和其他国产模型原生协议不在第一版范围内。
