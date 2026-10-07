# 数据格式约定(前后端 ↔ 解析 / Agent / 测试数据)

## 纠纷类型 `type`
`route_deviation`(绕路)· `no_show_charge`(爽约收费)· `property_damage`(财物损坏)· `safety_accident`(安全事故)

## 证据 `EvidenceItem`
案件里的 `evidence` 是一个数组,每条证据由**一方**上传:

```json
{
  "id": "ev-001",
  "party": "driver",
  "kind": "gps",
  "title": "GPS实际轨迹",
  "content": "文字内容:聊天记录 / GPS 数据点(JSON 或 CSV 文本)/ 付款明细 / 文字说明",
  "fileName": "可选,上传文件名",
  "fileUrl": "可选,上传文件的存放路径(图片/PDF 由解析模块处理)",
  "uploadedAt": "2024-12-15T16:00:00Z"
}
```

| 字段 | 取值 |
|---|---|
| `party` | `driver`(司机)· `rider`(乘客) |
| `kind` | `text`(文字说明)· `chat`(聊天记录)· `gps`(GPS 数据)· `payment`(付款记录)· `photo`(照片) |

提交时客户端只需要传 `party`、`kind`、`title`、`content`,`id` 和 `uploadedAt` 由服务端生成。

## 接口
- `POST /api/disputes`:创建案件,`evidence` 为数组(至少 1 条)
- `POST /api/disputes/:id/evidence`:司机或乘客补充证据,body 为 `{ party, kind, title, content }`
- `GET /api/disputes/:id`:返回案件,含 `evidence` 数组
- `POST /api/disputes/:id/review`:触发 AI 审查

## 给各部分的提示
- **测试数据(第④部分):** 案件的证据请按上面格式写,GPS、聊天记录以文本形式放在 `content` 里。
- **解析(第①部分):** 图片/PDF 解析后的文字,写回对应证据的 `content`。
- **Agent(第③部分):** 读取 `evidence`,按 `party` 分给 rider advocate / driver advocate。
