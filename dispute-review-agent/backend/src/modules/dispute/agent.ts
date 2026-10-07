/**
 * Dispute Review — AI Agent
 *
 * Core intelligence: analyzes driver-passenger disputes using LLM
 * and produces structured review with recommendation and confidence score.
 * Falls back to rule-based analysis when LLM API is unavailable.
 */

import { chatCompletion } from '../../lib/hunyuan-chat';
import type { DisputeCase, AIReview, Recommendation } from './types';

const SYSTEM_PROMPT = `你是一名专业的网约车平台纠纷审查AI Agent，负责客观、公正地审查司机与乘客之间的纠纷，并给出有理有据的处理建议。

## 审查职责：
1. 客观分析双方的陈述，不偏袒任何一方
2. 将双方陈述与行程数据（路线、时间、费用、距离）交叉验证
3. 识别关键争议点和事实分歧
4. 评估证据的可信度和相关性
5. 适用网约车平台常见规则，包括：
   - 计费规则与绕路认定标准
   - 司机服务标准与行为规范
   - 乘客乘车行为准则
   - 安全要求（安全带、禁止骚扰）
   - 路线合规与导航使用规范
   - 取消订单与爽约政策
6. 基于可获取的信息做出公正裁决

## 回复格式：
你必须仅回复一个JSON对象（不要markdown标记，不要多余文字），格式如下：
{
  "summary": "纠纷的一句话摘要",
  "keyIssues": ["关键争议点1", "关键争议点2"],
  "driverPerspective": "司机立场、主张和可信度的详细分析",
  "passengerPerspective": "乘客立场、主张和可信度的详细分析",
  "evidenceAnalysis": "现有证据如何支持或反驳各方主张的评估",
  "policyReferences": ["适用的规则1", "适用的规则2"],
  "recommendation": "driver" | "passenger" | "shared" | "inconclusive",
  "recommendationReasoning": "做出此建议的详细理由",
  "suggestedActions": ["建议措施1", "建议措施2"],
  "confidenceScore": 0-100的整数,
  "confidenceReasoning": "置信度评估说明，考虑证据质量和陈述一致性"
}

## 注意事项：
- 完全客观，不默认偏袒任何一方
- 历史评分作为一个参考因素，但不是唯一依据
- 如证据不足或双方陈述可信度相当，将recommendation设为"inconclusive"，confidenceScore低于50
- 如双方均有责任，将recommendation设为"shared"
- 始终提供具体、可操作的建议措施
- 所有分析内容使用简体中文`;

function buildCaseMessage(caseData: DisputeCase): string {
  const trip = caseData.trip;
  const drv = caseData.driver;
  const pas = caseData.passenger;
  const evi = caseData.evidence;

  return `## 纠纷案件：${caseData.title}

### 案件信息
- 案件编号：${caseData.caseNumber}
- 纠纷类型：${caseData.type}
- 优先级：${caseData.priority}

### 司机信息
- 姓名：${drv.name}
- 工号：${drv.id}
- 历史评分：${drv.rating}/5.0
- 陈述：${drv.statement}

### 乘客信息
- 姓名：${pas.name}
- 账号：${pas.id}
- 历史评分：${pas.rating}/5.0
- 陈述：${pas.statement}

### 行程详情
- 起点：${trip.pickupLocation}
- 终点：${trip.dropoffLocation}
- 上车时间：${trip.pickupTime}
- 下车时间：${trip.dropoffTime}
- 车费：¥${trip.fare}
- 行驶距离：${trip.distance} km
- 车辆：${trip.vehicleModel}（${trip.plateNumber}）

### 证据信息
- 证据描述：${evi.description}
- 证据清单：${evi.items.join('、')}

请审查此纠纷并按指定JSON格式回复。`;
}

function parseAIResponse(text: string): AIReview {
  let jsonStr = text.trim();

  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  const start = jsonStr.indexOf('{');
  const end = jsonStr.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    jsonStr = jsonStr.substring(start, end + 1);
  }

  const parsed = JSON.parse(jsonStr);

  return {
    summary: parsed.summary || '',
    keyIssues: Array.isArray(parsed.keyIssues) ? parsed.keyIssues : [],
    driverPerspective: parsed.driverPerspective || '',
    passengerPerspective: parsed.passengerPerspective || '',
    evidenceAnalysis: parsed.evidenceAnalysis || '',
    policyReferences: Array.isArray(parsed.policyReferences)
      ? parsed.policyReferences
      : [],
    recommendation: parsed.recommendation || 'inconclusive',
    recommendationReasoning: parsed.recommendationReasoning || '',
    suggestedActions: Array.isArray(parsed.suggestedActions)
      ? parsed.suggestedActions
      : [],
    confidenceScore:
      typeof parsed.confidenceScore === 'number'
        ? parsed.confidenceScore
        : 50,
    confidenceReasoning: parsed.confidenceReasoning || '',
    reviewedAt: new Date().toISOString(),
  };
}

// ============================================
// Fallback: Rule-based analysis when LLM is unavailable
// ============================================

function generateFallbackReview(caseData: DisputeCase): AIReview {
  const drv = caseData.driver;
  const pas = caseData.passenger;
  const trip = caseData.trip;
  const evi = caseData.evidence;

  // Heuristic: compare ratings
  const ratingDiff = drv.rating - pas.rating;

  // Heuristic: statement length (longer = more detailed)
  const drvStmtLen = drv.statement.length;
  const pasStmtLen = pas.statement.length;

  // Determine recommendation based on heuristics
  let recommendation: Recommendation = 'inconclusive';
  let confidenceScore = 45;

  const driverScore = ratingDiff * 10 + (drvStmtLen - pasStmtLen) * 0.05;
  const passengerScore = -ratingDiff * 10 + (pasStmtLen - drvStmtLen) * 0.05;

  if (Math.abs(driverScore - passengerScore) < 5) {
    recommendation = 'shared';
    confidenceScore = 40;
  } else if (driverScore > passengerScore + 10) {
    recommendation = 'driver';
    confidenceScore = 55;
  } else if (passengerScore > driverScore + 10) {
    recommendation = 'passenger';
    confidenceScore = 55;
  }

  // Type-specific adjustments
  const typePolicies: Record<string, string[]> = {
    route_deviation: [
      '《计费规则》— 按实际行驶路线计费',
      '《绕路认定标准》— 偏离导航推荐路线超过10%可认定为绕路',
      '《路线合规规范》— 司机应按导航推荐路线行驶，改路线需征得乘客同意',
      '《退款政策》— 确认绕路后应退还差价',
    ],
    no_show_charge: [
      '《取消订单政策》— 超过等待时间可取消',
      '《爽约处理规则》— 爽约方承担相应责任',
    ],
    property_damage: [
      '《财物损坏处理规则》— 责任方承担赔偿，需提供照片等证据',
      '《平台服务协议》— 车内财物损坏的申报与定损流程',
    ],
    safety_accident: [
      '《乘车安全规范》— 乘客必须系好安全带',
      '《司机行为准则》— 遇安全威胁时司机有权终止行程',
      '《安全事件处理流程》— 应保留录音录像证据',
    ],
  };

  const policies = typePolicies[caseData.type] || [
    '《平台服务协议》',
    '《纠纷处理流程》',
  ];

  // Estimated fare per km for sanity check
  const farePerKm = trip.distance > 0 ? trip.fare / trip.distance : 0;
  const fareNote =
    farePerKm > 0
      ? `本次行程每公里费用约¥${farePerKm.toFixed(1)}，`
      : '行程未完成，';

  const recLabels: Record<Recommendation, string> = {
    driver: '支持司机方',
    passenger: '支持乘客方',
    shared: '双方共担责任',
    inconclusive: '证据不足以判定',
  };

  return {
    summary: `${caseData.title} — 基于规则分析，${recLabels[recommendation]}（置信度${confidenceScore}%）。`,
    keyIssues: [
      `双方陈述存在分歧：司机称"${drv.statement.substring(0, 30)}..."，乘客称"${pas.statement.substring(0, 30)}..."`,
      `历史评分差异：司机${drv.rating}分 vs 乘客${pas.rating}分`,
      `证据情况：${evi.items.length}项证据（${evi.items.join('、')}）`,
      trip.distance > 0
        ? `${fareNote}行驶${trip.distance}公里，车费¥${trip.fare}`
        : '行程未正常完成',
    ],
    driverPerspective: `司机${drv.name}（工号${drv.id}，评分${drv.rating}/5.0）的陈述长度${drvStmtLen}字，${
      drvStmtLen > pasStmtLen ? '提供了较详细的说明' : '说明相对简略'
    }。${ratingDiff > 0 ? `其历史评分(${drv.rating})高于乘客(${pas.rating})，信用记录较好。` : `其历史评分(${drv.rating})与乘客(${pas.rating})相当。`}综合来看，${driverScore > passengerScore ? '司机方主张可信度较高' : '司机方主张可信度一般'}。`,
    passengerPerspective: `乘客${pas.name}（账号${pas.id}，评分${pas.rating}/5.0）的陈述长度${pasStmtLen}字，${
      pasStmtLen > drvStmtLen ? '提供了较详细的说明' : '说明相对简略'
    }。${ratingDiff < 0 ? `其历史评分(${pas.rating})高于司机(${drv.rating})，信用记录较好。` : `其历史评分(${pas.rating})与司机(${drv.rating})相当。`}综合来看，${passengerScore > driverScore ? '乘客方主张可信度较高' : '乘客方主张可信度一般'}。`,
    evidenceAnalysis: `现有证据包括${evi.items.length}项：${evi.items.join('、')}。${evi.description}。证据的充分性${evi.items.length >= 3 ? '较好，能够辅助判断事实' : '一般，建议补充更多证据'}。由于当前为规则分析模式（非AI深度分析），建议结合录音、录像等关键证据进行人工复核。`,
    policyReferences: policies,
    recommendation,
    recommendationReasoning: `基于规则分析系统评估：司机综合得分${driverScore.toFixed(1)}，乘客综合得分${passengerScore.toFixed(1)}。${recommendation === 'shared' ? '双方得分接近，均有部分责任。' : recommendation === 'driver' ? '司机方综合得分更高，主张更具可信度。' : recommendation === 'passenger' ? '乘客方综合得分更高，主张更具可信度。' : '双方得分差距不大，现有证据不足以做出明确判定。'}建议结合实际录音录像证据做最终确认。`,
    suggestedActions: [
      recommendation === 'driver'
        ? `维持原车费¥${trip.fare}，驳回乘客退款诉求`
        : recommendation === 'passenger'
          ? `退还乘客车费¥${trip.fare}，对司机发出警告`
          : recommendation === 'shared'
            ? '双方各承担部分责任，协商解决'
            : '暂不做裁决，补充证据后重新审查',
      '调取车内录音/录像核实双方陈述',
      '核查GPS轨迹与导航推荐路线的一致性',
      '根据最终核实结果更新案件处理决定',
      '记录本次审查结果，归档备查',
    ],
    confidenceScore,
    confidenceReasoning: `本次审查使用规则分析模式（LLM API不可用时自动回退），置信度较低(${confidenceScore}%)。评分基于历史评分差异、陈述详细程度和证据数量等启发式规则，非深度语义分析。建议在AI审查服务恢复后重新进行LLM深度审查以获得更准确的裁决建议。`,
    reviewedAt: new Date().toISOString(),
  };
}

/**
 * The main agent function: reviews a dispute case and returns structured analysis.
 * Tries LLM first, falls back to rule-based analysis on failure.
 */
export async function reviewDispute(
  caseData: DisputeCase
): Promise<AIReview> {
  const userMessage = buildCaseMessage(caseData);

  try {
    const responseText = await chatCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      { temperature: 0.2, max_tokens: 4096 }
    );
    return parseAIResponse(responseText);
  } catch {
    // Fallback to rule-based analysis when LLM is unavailable
    return generateFallbackReview(caseData);
  }
}
