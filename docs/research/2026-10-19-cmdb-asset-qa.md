# CMDB 资产问答：如何做成 DeepSeek 官网风格，以及应借用哪些架构

- **日期**: 2026-10-19
- **问题**: cmdbcore + cmdbfe 如何实现类似 chat.deepseek.com 的资产查询问答（流式对话、侧栏会话、Markdown、思考过程），以及应借用哪些已有实现。
- **范围**: 四个本地树（re-dp-portal、cmdbcore、cmdbfe、deepseek-harness）+ DeepSeek / OpenAI 官方 API 文档。
- **非范围**: 不实现代码；不把 DeepSeek Harness 整仓搬进 CMDB，除非证据支持。

---

## 1. 当前状态盘点

### 1.1 re-dp-portal（已有 DeepSeek 风格原型）

**定位**: 本机 DeepSeek 查询入口；页面本地启动，问答走官方 API（思考 + 智能搜索）。会话在浏览器 `localStorage`，不同步官网账号。

来源: `README.md`。

**栈**

| 项 | 事实 | 来源 |
|---|---|---|
| UI | React 19 + Vite 6 + TypeScript | `package.json` |
| Markdown | `react-markdown` + `remark-gfm` | `package.json`, `src/MarkdownBody.tsx` |
| 本地服务 | Vite plugin 中间件，不是独立 BFF 进程 | `vite.config.ts`, `server/chatProxy.ts` |
| 默认模型 | `deepseek-flash` | `server/deepseek.ts` `DEFAULT_MODEL` |
| 上游协议 | Anthropic Messages API，`base_url=https://api.deepseek.com/anthropic`，`POST {base}/v1/messages` | `.env.example`, `server/chatProxy.ts` |
| 浏览器协议 | 浏览器 `POST /api/chat`，上游 SSE 被转成 **NDJSON**（`application/x-ndjson`） | `server/chatProxy.ts` |
| 密钥 | `DEEPSEEK_API_KEY` 只在 Vite 服务端；浏览器不持有 key | `server/chatProxy.ts`, `.env.example` |

**已实现（对照官网体验）**

1. **落地页 + `/chat/:id` 路由**  
   `src/App.tsx`：`/` 落地页（口号「探索未至之境」+ `QueryComposer`）；`parseAppPath` 识别 `/chat` 与 `/chat/:sessionId`（`src/route.ts`）。无 React Router，用 `history.pushState` + `popstate`。

2. **流式输出**  
   上游 Anthropic SSE（`content_block_start` / `content_block_delta` / `message_stop`）由 `createAnthropicReducer` 压成客户端事件：`thinking`、`signature`、`search_start`、`search`、`text`、`error`、`done`（`server/deepseek.ts`）。`ChatPage` 用 `readNdjson` 逐行 `JSON.parse` 后 `applyClientEvent`（`src/ChatPage.tsx`, `src/process.ts`）。

3. **思考（thinking）**  
   Composer 开关 `thinking` → 请求体 `thinking: { type: "enabled"|"disabled" }`；开启时另加 `output_config.effort = "high"`（`server/deepseek.ts` `buildMessagesBody`）。UI：`AssistantTurn` 折叠「正在思考 / 已深度思考」，思考正文走 Markdown（`src/AssistantTurn.tsx`）。多轮回放会把带 `signature` 的 thinking block 原样送回上游（`thinkingBlocksForReplay`）。

4. **智能搜索**  
   默认 `search: true`（`src/chatUrl.ts` `DEFAULT_COMPOSER_MODE`）。开启时上游 `tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }]`（`server/deepseek.ts`）。这是 **DeepSeek 服务端网页搜索**，不是 CMDB 检索。UI 用 `SearchCard` 展示来源 URL/title。

5. **侧栏会话**  
   `ChatSession` 存 `id/title/createdAt/updatedAt/mode/messages`；key `re-dp-portal.sessions.v1`（`src/sessions.ts`）。分组文案「今天 / 30天内 / YYYY-MM」对应注释 *“Group sessions the way the official sidebar does”*。无服务端会话、无多端同步、无私有模式以外的持久化。

6. **Markdown**  
   GFM 表格；链接只允许 `http(s):`（`src/MarkdownBody.tsx` `urlTransform`）。

7. **API key 处理**  
   `GET /api/health` 返回 `{ ok, configured, model }`，不回 key。缺 key 时 `POST /api/chat` → 503（`server/chatProxy.ts`）。

**明确没有、且生产 CMDB 问答会需要的**

| 缺口 | 说明 |
|---|---|
| 认证 / 身份 | 无登录；任何能访问 127.0.0.1:5173 的人都能打官方 API（受本机绑定限制） |
| CMDB 工具 | 无 host/IP/SN 查询；`web_search` 会把资产问题搜到公网 |
| 结构化引用 | 来源是网页 URL，不是资产 SN / 详情页 hash 链接 |
| 服务端会话 | 仅 `localStorage`；无法审计「谁问过哪些资产」 |
| 权限范围 | 无 IAM 行/列过滤 |
| 写入防护 | 无工具，因此也无「禁止改资产」策略；一旦接 cmdbcore，必须显式只读 |
| 协议面 | 走 Anthropic `/v1/messages`，**没有** OpenAI `tools` / `tool_calls` 循环，无法直接映射 cmdbcore 函数 |
| 前端栈 | React 19，与 cmdbfe 的 Vue 2.7 不能组件级复用 |
| 流式传输 | NDJSON 而非浏览器原生 `EventSource`；cmdbcore 全仓 **无** `text/event-stream`（对本树 `*.go` 检索） |

---

### 1.2 cmdbcore（Go 后端）

**README**（`README.md`）仍是 GitLab 模板，**不是**产品说明。权威入口是代码：

- 进程: `cmd/cmdb_web/main.go`（Gin，`@host localhost:9008`，Swagger Title `CMDB API`）
- 路由: `pkg/cmdb_web/biz/router/router.go`
- 数据: MongoDB（资产主存）+ Redis + MySQL（duty 子系统）+ Elasticsearch（**审计检索，不是资产全文检索**）
- Go: `go 1.24.0`（`go.mod`）；HTTP: Gin；鉴权: Keycloak (`gocloak`) + IAM Casbin 旁路

**不是 GraphQL。** 对本树 `graphql|GraphQL` 检索无业务命中。对外是 REST：

| 前缀 | 用途 |
|---|---|
| `/cmdb/api/v1` | cmdbfe 主用；多数查询在 `apiV1WithCasbin` |
| `/cmdb/api/v2` | 工单 v2、`/common/assets_bundle` 等 |
| `/cmdb/openapi/v1` | 通用资产 CRUD + 机柜位置；另有整机 `POST /openapi/v1/machines/list` |
| `/cmdb/openapi/v2` | 协助工单等 |
| `/cmdb/api/v1/public` | 无鉴权下载 |
| `/cmdb/swagger/*` | swaggo |

来源: `pkg/cmdb_web/biz/router/router.go`。

**鉴权（两套，不要混用）**

1. **人机 UI / cmdbfe 路径**  
   `Auth.Enabled` 时：`keycloakAuth()` 解析 `Authorization: Bearer`（或 Cookie）经 `keycloak.GetKeycloakUserInfo`，把飞书形态 `GetUserInfoRespData` 放进 gin `user`（`pkg/cmdb_web/biz/router/middleware.go`）。写接口再叠 `casbinAuth()`：把 path/method/clientId 打到 IAM `POST /openapi/authorityPolicyCheck`。  
   DAL 层还有 **行权限**：`MachineDal.List` 调用 `iamDal.ApplyPermissionFilters(ctx, iamconsts.AssetTypeMachine, true)`（`pkg/cmdb_web/biz/dal/mongo/machine_dal/machine_dal.go`）。

2. **OpenAPI 机器调用方**  
   同一 Keycloak 中间件之后，`openapiCallerIDMiddleware` 用 **登录用户 Name 当 `caller_id`** 写入 context（`pkg/cmdb_web/biz/router/openapi_authz_middleware.go`）。权限模型是扁平表 `cmdb_api_permission`：`(caller_id, asset_type)` → actions / allowed_fields / scope(idc_ids, business_bus, asset_owners)。文档：`docs/CMDB通用接口鉴权设计.md`。  
   **推论**: 这套是给工单平台等 caller 用的，不是终端用户 RBAC。用 OpenAPI 做问答工具时，要么给问答 BFF 单独 `caller_id` 且 scope 收紧为只读 query，要么 **不要走 OpenAPI，改走带用户 IAM 行过滤的 service 层**（见第 4 节推荐）。

**资产如何建模**

常量（节选）在 `pkg/cmdb_web/biz/consts/default.go`：

`MACHINE`, `SWITCH_BOARD`, `SAFETY_DEVICE`, `OTN`, `FIREWALL`, `GPU`, `CPU`, `DISK`, `MEMORY`, `ETHERNET`, `RAID`, `POWER`, `FAN`, `BOARD_CARD`, `OPTICAL_MODULE`, `AOC`, `DAC`, 以及耗材 `FIBER_OPTIC_CABLE` / `TWISTED_PAIR` / …，`INTER_CONNECTION`，`IDC` / `IDC_RACK`。

Mongo 集合名（运维脚本清单，可作为主存对照）：`cmdb_machine`, `cmdb_machine_cpu/gpu/mem/disk/ethernet/raid`, `cmdb_switchboard`, `cmdb_safety_device`, `cmdb_optical_transport_network`, `cmdb_spare_part`（`pkg/cmdb_web/scripts/asset/sn_case_duplicate_governance.go`）。

整机列表请求 `ListMachineReq` 已覆盖问答最常见维度（`pkg/cmdb_web/biz/model/dto/machine_dto/machine_dto.go`）：

- `search`: 注释写「模糊搜索序列号、主机名、ip」
- `host_ips` / `bmc_ips` / `host_names` / `serial_numbers`
- `idc_ids` / `room_ids` / `rack_ids` / `business_bu` / `asset_owners`
- `asset_states` / `maintain_states` / `health_states` / `gpu_models` 等

**实现细节（与 DTO 注释不完全一致）**: `MachineDal.List` 在 `req.Search != ""` 时 `$or` 匹配 SN、system SN、**host_ip**、business_bu、maintain_provider、description；**hostname 那一行被注释掉了**（`machine_dal.go` 约 362–372 行）。按主机名查应走 `host_names` 精确 `$in`，或 `POST /machines/searchField`（`SearchFieldReq.field` 允许 `serial_number, host_name, host_ip, bmc_ip`）。

**工具调用可包装的真实查询面（只读）**

下列路径均存在于 `router.go`，**不要发明 endpoint**：

| 用户问题类型 | 现有 API | 备注 |
|---|---|---|
| 按 SN 看整机 | `GET /cmdb/api/v1/machines/:sn` | `GetMachine`；404 文案「设备SN信息不存在」 |
| 按 SN/IP/BU 列表 | `POST /cmdb/api/v1/machines/list` | `ListMachineReq`；含 IAM 行过滤 |
| 字段联想 | `POST /cmdb/api/v1/machines/searchField` | 下拉补全，不是语义搜索 |
| 按 IP 精确 | 同上，`host_ips` / `bmc_ips` | `$in` 精确匹配 |
| 交换机 / 安全设备 / OTN | `GET .../:sn` + `POST .../list` | `switchboard`, `safeties`, `otn` |
| 配件 GPU/CPU/Mem/Disk/… | 各 `POST /gpu|/cpu|/mem|/disk/.../list` + `GET .../:sn` | |
| 跨类型按 SN/ObjectId | `POST /cmdb/openapi/v1/assets/:asset_type/get` | `AssetsGetReq`: `serial_number` 或 `object_id` + 可选 `fields` |
| 跨类型过滤列表 | `POST /cmdb/openapi/v1/assets/:asset_type/list` | `Filter`：`logic` AND/OR + nested；operator 见下 |
| 批量 SN | `POST .../assets/:asset_type/batch_get` | |
| 机柜上有哪些资产 | `GET /cmdb/api/v1/idcs/assetsOnRack` | `IdcController.GetAssetsOnRack` |
| 机柜 / 机房 | `GET /idcs`, `POST /idcs/racks/query`, `GET /idcs/racks` | |
| 网络拓扑（互联） | `GET /interconnections/connection_info?sn=` | `GetConnectionInfoBySn` |
| 变更历史（工单+非工单） | `GET /cmdb/api/v1/workorder/asset_histories` | `GetAssetHistoriesReq`: `asset_type`, `serial_number`, `_id`, `history_type` |
| 审计事件 | `POST /cmdb/api/v1/audit/events/search` 与 `.../items/search` | ES 别名，**不是**资产倒排索引 |
| 采集实测 vs 台账 | `GET /machines/:sn/collect-sync`, `GET /machines/:sn/initial-log` | |
| 归属 / BU 元数据 | `GET /common/meta/business_bus` | |

OpenAPI `list` 过滤算子（`buildCondition`，`pkg/cmdb_web/biz/service/openapi_assets/build_filter.go`）：  
`eq`, `not`, `ne`/`neq`, `gt/gte/lt/lte`, `between`, `in`/`nin`, `all`, `size`, `elemMatch`, `type`, `regex`, `like`/`contains`, `startsWith`, `endsWith`, `exists`。  
这已经是查询 DSL，**不必再 NL2SQL**。

**禁止给模型当工具的面**

- `POST /cmdb/api/v1/mongo/find|aggregate|update|...`：注释写明「仅运维脚本可用，前端 / 业务接口 / OpenAPI / 其他服务禁止调用」（`router.go`）。
- 全部 `opstools/*`、`batch_create` / `batch_update` / `batch_delete`、工单 `*Apply`：写入或运维。
- OpenAPI `TransactionalBatch`、机柜 `batch_update`。

**NLP / 向量检索**: 业务代码中无 embedding、无 OpenAI/DeepSeek 客户端、无 RAG 管线（检索仅命中第三方 Redfish 常量 `NLPort`）。资产检索 = Mongo 过滤 + IAM。

**流式**: cmdbcore **没有** SSE/NDJSON chat 端点。问答 BFF 是新能力。

Swagger 产物: `cmd/cmdb_web/docs/swagger.yaml` / `swagger.json`（swaggo 生成）。

---

### 1.3 cmdbfe（前端）

**栈**（`README.md`, `package.json`）: Node 18+；**Vite 4 + Vue 2.7 + Element UI + Vuex 3 + Vue Router 3**；全局 ESM。`vue-router` **`mode: "hash"`**（`src/router/index.js`）。HTTP：axios 封装，`VITE_BASE_API` 默认 `/cmdb/api/v1`，请求头 `Authorization: Bearer ${token}`（`src/utils/request.js`）。开发代理把 `/cmdb/api/v1` 指到测试机（`vite.config.js` `server.proxy`）。

**认证 / 会话**

- 启动：`src/main.js` 若无 token 则走 OAuth `code` → `requestToken`；有 token 才 `new Vue({ router, store })`。
- Keycloak 配置在 `src/keyCloak/index.js`（realm `cmdb`），但 **init 被注释**；实际 token 在 `src/utils/keycloakLogin`（被 `request.js` import）。
- 菜单与动态路由：`store/modules/user.js` `getUserInfo` → 后端用户信息里的 `menus` → `menuToRoutes`（`src/utils/route.js`）。页面必须在 `src/pages/**/*.vue`，否则 IAM 组件路径对不上 glob。
- `src/router/permission.js` 里「无 token 跳 login」被注释；鉴权主要靠后端 401 + 前端刷新 token。

**现有「搜索」**

- 各资产列表页是 **筛选项 + 表格**（例：`src/pages/server/dataCenter.vue` 调 `findPage` → `POST /machines/list`）。
- Header 有 `Search.vue`，占位文案「需要搜索的联想内容」，**未接后端**（`src/components/layout/header/Search.vue`）。
- `src/api/index.js` 的 `checkToken()` 打 `/token/free/check`（注释：大模型次数）。**cmdbcore 路由里没有该 path**（对本树检索 `token/free/check` 无命中）。**推论**: 残留或其它系统接口，不能当作已有 LLM 网关。

**详情深链（问答答案必须用这一套）**

`getAssetDetailLink`（`src/utils/asset.js`）：

- 默认 `#/server/dataDetail?sn={serial_number}&asset_type={asset_type}`
- `SWITCH_BOARD` → `/networkDevice/switchDetail`
- `OTN` → `/networkDevice/otnDetail`
- `SAFETY_DEVICE` → `/safetyDetail`

完整 URL：`buildHashLink`（`src/utils/url.js`）→ `{origin}{base}#{path}`，因为 hash 路由。列表里已有同样 pattern，例如 `dataCenter.vue` 的 `:link="\`/server/dataDetail?sn=${...}&asset_type=${assetType}\`"`。

详情数据：`src/api/findDetail/index.js` 按 `asset_type` 分发到 `GET /machines/:sn` 等；`CommonDetail.vue` 是隐藏菜单详情壳。

**聊天 UI 应放哪**

- 布局壳：`src/components/layout/index.vue`（Header + LeftMenu + BreadCrumb + `router-view`）。
- 产品入口候选（推论，需 IAM 菜单配置）：(a) 新 `src/pages/qa/index.vue`（或 `chat/index.vue`）挂左侧菜单；(b) Header 右侧与「控制台 / 权限申请」并列；(c) 替换未完成的 Header `Search.vue` 为「问资产」入口，点进全页聊天。
- **不要** iframe 嵌入 re-dp-portal：CORS/cookie、两套登录、hash 基路径都会裂。
- cmdbfe **没有** React、没有 markdown 库、没有 SSE 客户端。要在 Vue2 里重写聊天壳，或极窄地 vendor 一小段（见第 5 节）。

**可复用的前端模式**: axios + Bearer；IAM 动态路由；`getAssetDetailLink` / `buildHashLink`；详情 registry；表格列设置。没有会话侧栏、没有流式 reducer。

---

### 1.4 deepseek-harness（可选参考；不建议整仓接入）

这是 **全插件 Cordis agent 产品**：Session 日志、tool registry、agent-loop、Web/Desktop profile。架构地图：`docs/architecture.md`。

**可借用的想法（有文件证据）**

| 想法 | 证据 | CMDB 用法 |
|---|---|---|
| 工具是注册表 + JSON Schema，execute 返回 **canonical JSON**，不是散文 | `docs/cookbook/adding-a-tool.md`；`docs/subsystems/tools.md` | cmdbcore 工具返回 `MachineBrief` 级字段 + `detail_path`，禁止模型「编」SN |
| **Model-visible ⟺ logged**：进模型的内容必须能从 session log 重建 | `docs/architecture.md` Session log 节 | 问答会话落库：user 原文、tool 入参/出参、最终答案，便于审计「模型依据哪条资产」 |
| Turn = 多 step；step = 一次模型请求 + 它调用的工具；流式是 process-local chunk，提交后才是 durable message | `docs/architecture.md` Turn flow | BFF 内循环：stream thinking/text；tool_calls 在服务端执行后再二次请求；对浏览器只暴露思考/检索卡片/正文 |
| MCP 只是「外部工具注册到同一 `ctx.tools`」 | `packages/mcp/README.md`, `packages/mcp/mcp-client/README.md` | 若其它内部 agent 也要查 CMDB，可另做 MCP server **包一层只读 API**；cmdbfe 不必嵌 harness |
| UI card 与 model-facing render 分开 | adding-a-tool.md「How your tool renders in a UI」 | cmdbfe 用「检索到 N 台主机」卡片，而不是把整段 tool JSON 丢进 Markdown |

**不要整仓采用的理由（证据）**

- 启动契约：只允许 `dsh --profile …` 拉起 Node 应用（`docs/architecture.md` Application launch；仓库 `AGENTS.md`）。CMDB 生产面是 **Gin + Vue2 门户**，不是 Cordis 插件树。
- Client UI 文案走 i18n 字典、Web 卡片从 session event 投影：与 Element 表格门户是另一套产品。
- Session 格式版本、SQLite schema、sandbox、PTY、浏览器自动化：资产问答用不到，会把 cmdbcore 的 IAM/Mongo 真相源挤到旁边。
- Harness 的 MCP 客户端是 **消费** 外部 MCP，不是给 Vue 门户当 BFF。

**推论**: 抄「工具循环 + 会话日志 + 流式事件」三件事；不要引入 Cordis、不要让 cmdbfe 依赖 `@deepseek-ai/dsh-*`。

---

## 2. 目标 UX：官网像什么 vs CMDB 用户要什么

### 2.1 原型已经对齐的「官网像」

对照 re-dp-portal 与 DeepSeek 官方产品页（第一方：API 文档站与 V4 发布说明）：

- 落地大输入框 + 深度思考 / 智能搜索开关（`QueryComposer`）。
- 提交后进入 `/chat/:id`，侧栏「开启新对话」+ 按日期分组。
- 流式：先思考（`reasoning` / Anthropic thinking block），再正文 Markdown。
- 思考默认开启、effort 默认 high（官方 Thinking Mode 文档）；原型默认 **thinking=false, search=true**（`DEFAULT_COMPOSER_MODE`），与官网默认不完全相同。
- Instant / Expert 对应模型档：官方当前模型 id 是 `deepseek-flash` 与 `deepseek-v4-pro`（[Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/)）。`deepseek-chat` / `deepseek-reasoner` 已于 2026-07-24 退役（[V4 Preview Release](https://api-docs.deepseek.com/news/news260424)）。**不要**再按旧名设计。

### 2.2 CMDB 用户实际需要（与自由聊天的差）

资产问答的成功标准不是「像在跟通用助手聊天」，而是：

1. **命中可点击的资产**：答案里的 SN/IP/主机名必须来自工具返回值，并链到 cmdbfe 已有详情 hash（`getAssetDetailLink`）。
2. **引用**：每条关键断言带「依据」：哪次 tool 调用、哪个 `serial_number`、哪个过滤条件。空结果必须说「未找到」，禁止补全一个看起来像 IP 的字符串。
3. **权限内**：用户在列表页看不到的机器，聊天里也看不到（同一 IAM 行过滤）。
4. **多跳结构化问题**：例如「这台 BMC IP 对应哪台整机、在哪个机柜、同柜还有谁、最近工单改过什么」——这是 **多次只读工具**，不是一次网页搜索。
5. **不要公网搜索当默认**：原型的 `web_search_20250305` 会把内网 SN 泄漏到公网检索，且答案与台账无关。CMDB 产品默认应关闭，或换成「在 CMDB 内检索」开关（UI 文案可沿用「智能搜索」，语义改为内部工具）。

官网 UX 可保留：流式、思考折叠、侧栏会话、Markdown 表格（适合列出 3–20 台机器）。必须改掉：网页来源卡片 → **资产命中卡片**（SN、hostname、host_ip、BU、状态、详情链接）。

---

## 3. 架构选项（按本栈排序）

官方能力前提（所有选项共用）：

- DeepSeek 与 OpenAI Chat Completions 兼容；`stream=true` 为 SSE；`tools` 仅 `type: function`（[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion)，[Tool Calls](https://api-docs.deepseek.com/guides/tool_calls)）。
- 思考：`thinking: {type: enabled|disabled}` + `reasoning_effort`；流式增量在 `delta.reasoning_content` 与 `delta.content`（[Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)）。
- **带 `tools` 时必须把历史 `reasoning_content` 原样回传**，否则 400（同上 Thinking Mode / Tool Calls）。
- `tool_choice` 的 `required` / 具名强制在 thinking mode 下 400，需先关思考（Chat Completions 文档）。
- `strict` schema 是 Beta，需 `base_url=https://api.deepseek.com/beta`（Tool Calls 文档）。对 IP 字段可用 `format: ipv4`（strict 支持的 string format 含 ipv4/ipv6/hostname）。
- OpenAI 官方函数调用语义：模型 **不执行** 函数；应用执行后把 `role: tool` + `tool_call_id` 送回；可多轮（[Function calling](https://platform.openai.com/docs/guides/function-calling)）。
- Anthropic `/messages` 支持中途插入 tool 结果；Chat Completions **不支持** mid-conversation 插入非模型产生的 tool call（DeepSeek Tool Calls：「Inserting Tool Calls Mid-Conversation」）。CMDB BFF 应选 **一种** 协议并坚持。re-dp-portal 今天走 Anthropic；**接 cmdbcore 函数时更顺的是 OpenAI Chat Completions tools**（官方 Python 示例即此格式）。

### 选项 A — 薄聊天 UI + 代理 DeepSeek + 把检索结果塞进 prompt

**做法**: 保持 re-dp-portal 模式：cmdbfe 流式打 BFF，BFF 先 `ListMachines({search: q})`，把前 N 条 JSON 塞进 system/user，再 `stream` 让模型写 Markdown。

**优点**: 实现量最小；能复用原型的 NDJSON 事件与思考开关。  
**缺点**: 单次检索语义固定（整机 `search` 还对 hostname 不生效）；多跳（IP→机柜→邻居）要人工编排；长列表撑爆上下文；模型仍可能「润色」出不在列表里的 IP。  
**结论**: 只适合内部 demo，不作为生产。

### 选项 B — Tool-calling agent：模型调用 cmdbcore 查询工具再作答

**做法**: 与官方 Tool Calls 示例相同：暴露 `get_machine`、`search_machines`、`list_assets`、`get_rack_assets`、`get_connection_info`、`get_asset_histories` 等；服务端执行；再带 tool 结果请求最终答案。

**优点**: 对齐现有 API 形状；多跳问题自然；空结果可强制「未找到」；思考模式从 V3.2 起支持 tools。  
**缺点**: 要写循环、限流、tool 结果裁剪、把 OpenAI 流映射到 UI 事件；thinking+tools 必须回传 CoT。  
**结论**: **生产主路径**（与选项 F 组合）。

### 选项 C — RAG：把资产导出成文档做 embedding

**优点**: 自然语言「像文档库」。  
**缺点（对本栈）**: 资产是 **活 Mongo 文档**，工单频繁改 placement/IP/状态；embedding 滞后等于谎报在线机器。cmdbcore **没有** 向量库。SN/IP 是精确键，倒排文档检索是弱匹配。审计 ES 也不是为 RAG 建的。  
**结论**: 不作为查询主路径。若将来做「字段含义 / 状态枚举说明书」可对 **静态数据字典**（`/common/enums`）做小 RAG，与台账查询分开。

### 选项 D — NL2SQL 或生成 Mongo/查询 DSL

**优点**: 理论上一次生成复杂过滤。  
**缺点**: 主存是 Mongo 不是 SQL。OpenAPI 已有 Filter DSL；让模型直接吐 `$regex`/`$elemMatch` 等于开放 Mongo 注入面。`POST /mongo/find` 已被标明禁止业务调用。生成错误 operator 会导致 400 或全表扫描。  
**结论**: **不要**让模型生成原始 Mongo。若需要灵活列表，只允许模型填 **白名单工具参数**（见 F），由服务端编译成已有 `ListMachineReq` 或 `AssetsListReq`。

### 选项 E — 嵌入 DeepSeek Harness / 用 MCP 包 cmdbcore

**做法**: 跑 `dsh --profile web|sdk`，MCP server 调 cmdbcore。

**优点**: 现成 tool registry、session JSONL、流式 UI。  
**缺点**: 运行时（Node Cordis）与 cmdbcore（Go）/cmdbfe（Vue2）身份体系（Keycloak cookie vs harness credentials）不一致；IAM 行过滤难以从 MCP stdio 透传用户 token；运维多一个 agent 产品；门户用户不需要 sandbox/PTY。MCP 适合 **其它 agent 复用 CMDB 只读能力**，不是 cmdbfe 第一入口。  
**结论**: MCP 可作为 **第二阶段对外能力**；不要把 harness 嵌进门户。

### 选项 F — 混合：工具检索 + 带引用的 grounded 回答（推荐）

**做法**: B 的 tool loop + 强制引用协议 + 答案后处理（只保留工具返回过的 SN/IP）+ UI 资产卡片 + hash 深链。可选极小「枚举/字段说明」静态上下文，不是资产 RAG。

**优点**: 满足 CMDB 安全与产品形态；官方 API 完整支持；映射到已有 REST。  
**缺点**: 比 A 多一个 agent 循环实现（但仍远小于 E）。

**排序（本栈）**: **F > B ≫ A > C > D**；E 仅作对外 MCP，不进 cmdbfe。

---

## 4. 推荐路径（cmdbcore + cmdbfe）

### 4.1 Chat BFF 放哪

**放在 cmdbcore**：新路由组，例如 `POST /cmdb/api/v1/qa/chat`（SSE 或与原型兼容的 NDJSON）+ `GET/POST /cmdb/api/v1/qa/sessions`。理由：

- 工具执行必须带 **同一用户** 的 Keycloak token 与 IAM 行过滤；在 Gin 里 `c.Set("user")` 已存在。
- 资产查询 service/DAL 已在进程内，避免 BFF 再 HTTP 打自己（且 OpenAPI caller_id 语义不同）。
- cmdbfe 已代理 `/cmdb/api/v1`。
- `DEEPSEEK_API_KEY` 只留在 cmdbcore 配置（对齐 portal：浏览器永不持有 key）。

**不要**做 Vite plugin（portal 的 `deepseekChatProxy` 只适合本机 demo）。**不要**让浏览器直连 `api.deepseek.com`。

协议建议：对模型用 **OpenAI Chat Completions**（`https://api.deepseek.com/chat/completions`，`model: deepseek-flash`，`stream: true`，`tools: [...]`，`extra_body.thinking`）。对浏览器沿用 portal 的 NDJSON 事件，并扩展：

```text
thinking | text | error | done
tool_start { name, args_preview }
tool_result { name, hits: [{ serial_number, title, detail_path }] }  // 替代 web search 卡片
```

思考开 + 工具：按官方要求把每轮 `reasoning_content` 回传。CMDB 场景建议默认 **thinking on、公网 search off**（与 portal 默认相反）。

### 4.2 工具如何映射到现有 API

原则：工具内部调 **service 函数**（`MachineService.ListMachines` / `GetMachine` 等），传入当前 `gin.Context`，以走 `ApplyPermissionFilters`。HTTP 形状仅作为契约文档。

建议 v1 工具集（只读、有上限）：

| Tool name | 映射 | 参数约束 | 返回（canonical JSON） |
|---|---|---|---|
| `search_machines` | `ListMachines` + `ListMachineReq` | `page_size` 封顶如 20；`search` / `host_ips` / `serial_numbers` / `idc_ids` / `business_bu` 等白名单字段 | `items[]` + `pagination.total` + 每条 `detail_path` |
| `get_machine` | `GetMachine` | `sn` required | 详情摘要（禁止整坨含密码/带外凭据的原始文档；只投影问答需要的字段） |
| `search_field` | `SearchField` | `field` enum: `serial_number\|host_name\|host_ip\|bmc_ip` | 候选字符串列表（防用户口误） |
| `list_assets` | OpenAPI `List` **或** 各类型 PageList | `asset_type` enum 来自 `consts`；filter 只允许 `eq/in/like` 白名单 keys | 同 search |
| `get_assets_on_rack` | `GetAssetsOnRack` | `idc_id`, `rack_id` | 机柜上资产列表 + 深链 |
| `get_connection_info` | `GetConnectionInfoBySn` | `sn` | 互联 |
| `get_asset_histories` | `GetAssetHistoriesPaged` | `asset_type`, `serial_number`；`page_size` 封顶 | 变更摘要，不回完整 old/new blob |

**不要**暴露 `batch_update`、`mongo/*`、`opstools/*`。  
**不要**把 OpenAPI 的任意 `Filter` 对象交给模型；由 Go 把 tool args 编成 DTO。

System prompt（要点，非原文）：只根据 tool 结果回答；结果为空则明确未找到；列出资产时用 Markdown 表；每行附 cmdbfe hash 链接；禁止编造 IP/SN/主机名。

### 4.3 认证 / 身份

```text
浏览器  --Bearer Keycloak-->  cmdbfe axios
                         -->  cmdbcore keycloakAuth + casbinAuth
                                   --> QA handler
                                   --> tools 使用同一 ctx（IAM 行过滤）
                                   --> DeepSeek（服务端 API key）
```

- 新 path 必须进 IAM `authorityPolicyCheck`（与现有 `casbinAuth` 一致），并在 IAM 配菜单按钮。
- 会话文档带 `user_id`（Keycloak / 飞书 user），列表只返回自己的会话。
- **不要**用一个共享 OpenAPI `caller_id=workflow` 去查全量资产再在 prompt 里「请自行过滤」——那是权限洞。
- 若必须走 OpenAPI 鉴权表：为问答服务建 **query-only** caller，且 `scope` 仍无法表达「当前登录人」的行规则；故 **v1 走 api/v1 service + IAM 过滤**。

### 4.4 流式与会话持久化

- **流式**: Gin 写 `Content-Type: application/x-ndjson` 或 `text/event-stream`，`Flush`。cmdbfe 用 `fetch` + `ReadableStream`（Vue2 无官方 SSE hook，可抄 `ChatPage.readNdjson` 的逻辑改写成 JS）。
- **会话**: Mongo 新集合（例如 `cmdb_qa_session`），字段对齐 `ChatSession` + `user_id` + tool trace。不要只靠 `localStorage`（多设备、审计、权限）。浏览器可做乐观缓存，权威在服务端。
- **日志**: 持久化 user 文本、tool 名/参数/摘要结果、最终 assistant 文本。思考过程是否落库需法务/安全拍板（可能含推理中的 IP）。Harness 的「进模型必进 log」在这里对应：**tool 结果进会话**，否则无法事后解释答案。

### 4.5 答案如何深链到 cmdbfe

BFF 在 tool 结果里生成 `detail_path`（与 `getAssetDetailLink` 相同规则）。模型只输出该 path 或 SN；前端 Markdown 渲染器把 `/server/dataDetail?sn=...` 转成 `buildHashLink` 的 `<a>`（`target=_blank` 或站内 `this.$router.push`）。

**不要**依赖模型记忆前端路由表；path 由后端生成。IDC 详情是 `/dataDetail?sn={name}&asset_type=DATACENTER`（`findDetail/index.js`），与整机不同。

### 4.6 评估与安全（幻觉 IP/主机名是事故级）

| 控制 | 做法 |
|---|---|
| Grounding | 最终答案扫描 IPv4/SN 形态 token，若不在本轮 tool 结果集合中则剥离或拒绝发送 |
| 空结果 | 工具返回 `total=0` 时禁止模型「举例一台」 |
| 数量 | `page_size` 硬顶；`total` 很大时只摘要并给列表页深链（带 query 的 `/server/dataCenter` 若可复现过滤） |
| 只读 | 工具白名单；忽略模型对未知函数名的 call |
| 注入 | 用户问题当 user 消息，永不拼进 tool JSON 的 key 名 |
| 出站 | 默认无 `web_search`；若运维坚持「查厂商公告」再单独开关，且 **不得**把 SN 当搜索词 |
| 数据出境 | 工具结果会发到 `api.deepseek.com`。需产品/安全确认：资产元数据（IP、位置、归属）是否允许出公网 LLM。这是 **上线门闩**（见第 6 节） |
| 评测集 | 固定问句：按 SN、按 host_ip、按不存在的 IP、按无权限 SN、按机柜、按变更历史；断言「未找到」与「无权限」不可变成编造记录 |
| strict | 对 `host_ip` 参数可考虑 Beta `format: ipv4`，减少胡写参数；非必须 |

---

## 5. 从 re-dp-portal 复用什么 vs 在 cmdbfe 重写什么

**复用（思想与可移植逻辑，不是 npm 包）**

- 事件模型：`ClientEvent` + `applyClientEvent` + `AssistantMessage.steps`（思考 / 检索卡片 / 正文分离）— `src/process.ts`。把 `search` step 改成 `tool_result`。
- 会话分组 `groupSessions`、标题截断 `titleFromQuery` — `src/sessions.ts`。存储改服务端。
- Composer：Enter 发送、中文输入法 `composition`、思考开关 — `src/QueryComposer.tsx`。智能搜索开关改名为内部检索或去掉。
- Markdown 消毒：只允许 http(s) 与站内 hash — `src/MarkdownBody.tsx`。Vue2 用 `markdown-it` + 白名单（cmdbfe 现无此依赖，需新增，体积远小于引入 React）。
- 视觉：`src/styles.css` 的思考折叠、用户气泡、侧栏密度，可当视觉参考；需改成 Element/云枢 Header 色板（`theme-change.css`）。
- 测试：`process.test.ts`、`sessions.test.ts` 的事件归并与分组用例可移植。

**不要复用 / 必须重写**

| portal | cmdbfe/cmdbcore |
|---|---|
| React 组件树 | Vue 2 SFC，放 `src/pages/qa/` + `src/components/qa/` |
| Vite `deepseekChatProxy` | Gin QA BFF |
| Anthropic Messages + `web_search_20250305` | Chat Completions + CMDB function tools |
| `localStorage` 唯一存储 | Mongo + 可选本地缓存 |
| 无鉴权 | Keycloak Bearer + Casbin + IAM 行过滤 |
| 落地页仿官网 | 门户内页，品牌是「云枢」Header（`layout/header/index.vue`） |

**推论**: 把 portal 当 **交互规格与 reducer 规格**，在 Vue2 重写 UI，在 Go 重写代理并加上 tool loop。不要 monorepo 嵌 React。

---

## 6. 待产品 / 基础设施拍板的问题

1. **数据出境**: 工具返回的 IP、SN、机柜、BU、负责人能否发给公网 DeepSeek API？若不能：需内网模型或脱敏（只发不透明 id，答案无法写 IP——产品形态会变）。
2. **v1 资产范围**: 是否只做 `MACHINE`（SN/IP/主机名/BU/机柜/历史），交换机/配件/互联放 v2？
3. **IAM**: 新菜单 path、Casbin 策略、是否允许「看见列表即允许问」。无权限 SN 是「不存在」还是「无权限」（安全上前者更稳，运维上后者更清晰）。
4. **思考过程展示与留存**: 思考文本可能回显内网 IP；是否对普通用户折叠且不落库。
5. **模型档**: `deepseek-flash`（延迟/成本）vs `deepseek-v4-pro`（难查询）。计费见官方 Pricing。
6. **配额**: cmdbfe `checkToken` 暗示曾有「大模型次数」概念，但 core 无对应 API。是否按用户/天限流。
7. **会话保留**: 多久删除；是否进现有 `audit/events`。
8. **默认开关**: 思考默认开？内部检索默认开？公网搜索必须默认关。
9. **失败态**: DeepSeek 429/地域网络；是否降级为「只跑 search_machines 表格、不经过模型」。
10. **写入**: 明确 v1 不做「帮我提单/改归属」。若以后做，必须独立审批工具，不得藏在问答里。
11. **OpenAPI vs api/v1**: 其它系统若要用同一问答，再抽 MCP/OpenAPI query-only caller；门户用户继续走 IAM 行过滤。
12. **主机名模糊搜**: 修复 `List` 的 `search` 是否包含 `host_name`（代码里被注释）是产品 bug 还是有意；问答工具应显式用 `host_names` / `searchField`。

---

## 来源索引

### 本地代码

- re-dp-portal: `README.md`, `package.json`, `vite.config.ts`, `.env.example`, `server/chatProxy.ts`, `server/deepseek.ts`, `src/App.tsx`, `src/ChatPage.tsx`, `src/process.ts`, `src/sessions.ts`, `src/route.ts`, `src/chatUrl.ts`, `src/AssistantTurn.tsx`, `src/MarkdownBody.tsx`, `src/QueryComposer.tsx`, `src/Sidebar.tsx`
- cmdbcore: `cmd/cmdb_web/main.go`, `pkg/cmdb_web/biz/router/router.go`, `middleware.go`, `openapi_authz_middleware.go`, `docs/CMDB通用接口鉴权设计.md`, `pkg/cmdb_web/biz/consts/default.go`, `.../machine_dto/machine_dto.go`, `.../machine_controller.go`, `.../machine_service.go`, `.../machine_dal.go`, `.../openapi_assets/{get,list,build_filter}.go`, `.../openapi_assets_dto.go`, `.../openapi_assets_controller.go`, `.../workorder_dto.go` (`GetAssetHistoriesReq`), `.../audit/search_client.go`, `.../config/config.go` (`Auth`), `pkg/cmdb_web/scripts/asset/sn_case_duplicate_governance.go`
- cmdbfe: `README.md`, `package.json`, `vite.config.js`, `src/main.js`, `src/utils/request.js`, `src/utils/route.js`, `src/utils/asset.js`, `src/utils/url.js`, `src/router/index.js`, `src/router/route.js`, `src/router/permission.js`, `src/store/modules/user.js`, `src/api/server/dataCenter.js`, `src/api/findDetail/index.js`, `src/api/index.js`, `src/components/layout/index.vue`, `src/components/layout/header/{index,Search}.vue`, `src/pages/server/dataCenter.vue`, `src/keyCloak/index.js`
- deepseek-harness: `docs/architecture.md`, `docs/cookbook/adding-a-tool.md`, `docs/subsystems/tools.md`, `packages/mcp/README.md`, `packages/mcp/mcp-client/README.md`

### 官方文档

- https://api-docs.deepseek.com/
- https://api-docs.deepseek.com/api/create-chat-completion
- https://api-docs.deepseek.com/guides/tool_calls
- https://api-docs.deepseek.com/guides/thinking_mode/
- https://api-docs.deepseek.com/guides/thinking_mode_api_example_streaming
- https://api-docs.deepseek.com/guides/responses_api
- https://api-docs.deepseek.com/quick_start/pricing/
- https://api-docs.deepseek.com/news/news260424
- https://platform.openai.com/docs/guides/function-calling

标注为「推论」的句子不是源码/官方文档的直接陈述。
