# 第②部分 前后端 — 现状与待办

截止 10-16。原则:先保证「提交案件 → 看到裁决」主线能跑通,其余按优先级做。

## 现状(已有)
- 后端 Express + Zod,内存存储(`backend/src/modules/dispute/store.ts`),重启数据会丢
- 接口:`GET /api/disputes`、`GET /stats`、`GET /:id`、`POST /`、`POST /:id/review`
- AI 审查:`agent.ts` 调混元,单个 agent 输出裁决、置信度
- 前端页面:Dashboard、SubmitCase、CaseDetail

## 与需求文档的差距
| 需求 | 现状 | 待办 |
|---|---|---|
| 四类纠纷:绕路、爽约收费、财物损坏、安全事故 | 类型是 fare/route/behavior/safety/cancellation/other | 改成四类(前后端类型、Zod、表单下拉、仪表盘标签) |
| 司机/乘客上传证据(照片、支付 PDF/图片、聊天、GPS) | 证据只是文字列表 `items: string[]` | 加文件上传接口 + 前端上传组件,按上传方(driver/passenger)归属 |
| 转人工(置信度低) | 无 | 加 `needsHuman` 标记(置信度 < 阈值),列表显示「待人工处理」 |
| 人工改判并反馈给知识库 | 无 | 加 `POST /:id/override`,记录人工结论,给丙的反馈循环用 |
| 与甲(解析)、丙(agent)对接 | 无约定 | 先写接口约定,见下 |

## 优先级
1. 接口约定(数据格式)发给甲、丙 —— 他们在等这个
2. 改四类纠纷
3. 证据上传(后端存文件 + 前端组件)
4. 案件详情显示双方证据 + 转人工标记
5. 人工改判接口与界面
6. 联调(留 15 号一天缓冲)

## 建议新增接口
- `POST /api/disputes/:id/evidence` — multipart 上传,字段 `party`(driver|passenger)、`kind`(photo|payment|chat|gps|policy)、`file`
- `GET /api/disputes/:id/evidence` — 证据列表
- `POST /api/disputes/:id/override` — 人工改判 `{ recommendation, reason }`
- `review` 结果增加 `needsHuman: boolean`
