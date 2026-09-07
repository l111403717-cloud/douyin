# Agent Provider 路由配置补全设计

日期：2026-09-07

状态：已确认，待书面复核

## 问题

统一 AI Runtime 后端已经具备 `Provider → Model Profile → Agent Profile` 数据关系，但“Agent 模型”页面仍以旧版单一 Hermes Gateway 为主要配置入口。旧 `settings.json` 的 Hermes 地址迁移失败时，还会阻塞全部配置查询，导致用户无法进入页面修正配置。

## 目标

- 页面能够管理多个 Provider，每个 Provider 独立保存类型、地址、超时、启用状态和密钥状态。
- 模型配置必须绑定一个 Provider。
- 每个 Agent 可以选择主模型与备用模型。
- 旧 Hermes 配置迁移失败时返回可操作的迁移状态，不阻塞新版 Provider、模型和 Agent 配置接口。
- 密钥只允许写入或清除，不通过 API 回读明文。

## 数据流

```text
Agent Profile
  ├─ primary_model_profile_id
  └─ fallback_model_profile_id
          ↓
Model Profile（模型名与推理参数）
          ↓ provider_id
Provider（类型、base_url、超时、能力）
          ↓
加密 Credential
```

Runtime 继续由 `ModelRouter` 按 Agent Key 解析上述关系。鉴权或配置错误不触发自动回退；仅连接、限流或模型不可用错误可以使用备用模型。

## 后端调整

1. 完善 Provider API 的测试连接能力，并保持地址安全校验。
2. 旧配置迁移失败时保存脱敏后的迁移错误状态，停止在每个旧接口请求中重复抛出 500；新版 `/api/ai/*` 查询仍可使用。
3. 旧 Hermes 兼容接口继续保留，但不再作为新版配置页的依赖。
4. 所有错误响应返回稳定的 4xx 与可理解信息，不暴露密钥。

## 前端调整

“Agent 模型”页面按以下顺序展示：

1. Provider：新增、编辑、启用/停用、设置/清除密钥、测试连接。
2. 模型配置：选择 Provider，填写模型名称和推理参数。
3. Agent 路由：为每个 Agent 选择主模型、备用模型及运行参数。
4. 旧 Hermes Gateway 区域移出主流程；存在迁移问题时显示一次性提示。

页面初始化改用新版 API，单个区块加载失败不阻塞其他区块。

## 兼容与迁移

- 已成功迁移的 Hermes、Codex CLI 和模型记录保持不变。
- 尚未迁移的旧配置尝试一次导入；非法远程 HTTP 地址作为待处理项展示，不删除原 `settings.json`。
- 用户在新版页面创建合法 Provider 后，可以继续使用其他 Agent 路由；旧配置错误不再造成全页不可用。
- 不自动放宽远程 HTTP 安全限制。

## 测试

- 旧 Hermes 迁移失败不会阻塞新版配置查询。
- Provider CRUD、密钥写入/清除及响应脱敏。
- 模型必须绑定存在且启用的 Provider。
- Agent 主模型、备用模型保存与 Router 解析。
- 前端构建成功，并验证 Provider、模型、Agent 三层配置数据映射。

## 非目标

- 不修改具体模型供应商协议。
- 不增加新的 Agent 类型。
- 不自动修改或删除用户的旧 `settings.json`。
- 不允许远程 HTTP Provider 绕过安全校验。
