/**
 * Dispute Review — In-memory data store with sample cases
 */

import type { DisputeCase, CreateDisputeDTO, DashboardStats } from './types';

let counter = 1000;

const cases: DisputeCase[] = [
  {
    id: 'case-001',
    caseNumber: 'DR-2024-001',
    status: 'resolved',
    priority: 'high',
    type: 'safety_issue',
    title: '司机报告乘客未系安全带且言语威胁',
    createdAt: '2024-12-10T09:30:00Z',
    updatedAt: '2024-12-10T14:20:00Z',
    driver: {
      name: '刘师傅',
      id: 'DRV-8821',
      rating: 4.9,
      statement:
        '乘客上车后拒绝系安全带，我好心提醒了三次。他不仅不听，还用脏话骂我，说"你管得着吗"。我停车要求他配合，他说"信不信我揍你"。考虑到安全风险，我在路边让他下车并结束订单。整个过程车内录音已开启。',
    },
    passenger: {
      name: '赵先生',
      id: 'PAS-3372',
      rating: 3.8,
      statement:
        '我就是没系安全带而已，司机凭什么赶我下车？他停在一个我不认识的地方，态度非常凶，说"不下车我报警了"。我确实说了几句不好听的话，但那是因为他先挑衅我的。我要求退款并补偿。',
    },
    trip: {
      pickupLocation: '福田区 coco酒吧',
      dropoffLocation: '龙岗区中心城',
      pickupTime: '2024-12-10T01:15:00Z',
      dropoffTime: '2024-12-10T01:35:00Z',
      fare: 45,
      distance: 10.2,
      vehicleModel: '现代伊兰特',
      plateNumber: '粤B·D7K28',
    },
    evidence: {
      description: '车内录音和行程录像均已调取',
      items: ['车内录音（全程）', '行车记录仪视频', 'GPS轨迹记录'],
    },
    review: {
      summary: '乘客拒绝系安全带并对司机言语威胁，司机基于安全考虑终止行程，行为合理。',
      keyIssues: [
        '乘客拒绝使用安全带，违反乘车安全规定',
        '乘客对司机进行言语威胁（"信不信我揍你"）',
        '司机在非目的地位置终止行程是否合理',
        '退款及补偿诉求是否成立',
      ],
      driverPerspective:
        '司机刘师傅（评分4.9）的行为有明确的安全依据。根据平台规定，乘客有义务系好安全带，司机有权提醒。在多次提醒无效且遭受言语威胁的情况下，司机选择终止行程属于合理的安全保护行为。车内录音可佐证其陈述。司机的陈述与行程时间线一致，可信度较高。',
      passengerPerspective:
        '乘客赵先生（评分3.8，低于平台平均）承认未系安全带和使用不当言语，但将责任归咎于司机"先挑衅"。然而其陈述未提供具体细节支持"司机先挑衅"的说法。乘客的评分和历史记录显示其可能存在类似行为模式。其退款补偿诉求缺乏依据。',
      evidenceAnalysis:
        '车内录音是关键证据，可验证双方陈述的真实性。根据司机描述，录音中应有"信不信我揍你"的表述。GPS轨迹显示行程在01:35终止，与司机所述时间一致。行车记录仪可补充车内画面。证据整体支持司机一方。',
      policyReferences: [
        '《乘车安全规范》第3条：乘客必须系好安全带',
        '《司机行为准则》第7条：遇安全威胁时司机有权终止行程',
        '《乘客行为规范》第5条：禁止对司机进行言语威胁或辱骂',
        '《退款政策》第4条：因乘客违规导致行程终止的不予退款',
      ],
      recommendation: 'driver',
      recommendationReasoning:
        '综合分析，乘客违反安全带规定并对司机进行言语威胁，司机终止行程的行为符合平台安全规范。乘客的退款及补偿诉求不成立。建议平台维持原车费，对乘客进行安全教育和行为警告，并保留对乘客账号的限制权利。同时表彰司机妥善处理安全事件。',
      suggestedActions: [
        '维持原车费¥45，驳回乘客退款诉求',
        '对乘客赵先生发出行为警告通知',
        '要求乘客完成安全乘车教育课程',
        '对司机刘师傅进行安全事件处理表彰',
        '归档录音证据以备后续申诉',
      ],
      confidenceScore: 88,
      confidenceReasoning:
        '车内录音可直接验证关键事实陈述，GPS数据支持时间线，双方评分差异明显，司机陈述逻辑自洽。扣除12分因未能完全排除乘客"先被挑衅"的可能性，需以录音最终核实。',
      reviewedAt: '2024-12-10T14:20:00Z',
    },
  },
  {
    id: 'case-002',
    caseNumber: 'DR-2024-002',
    status: 'pending',
    priority: 'urgent',
    type: 'fare_dispute',
    title: '乘客投诉司机绕路导致车费大幅增加',
    createdAt: '2024-12-15T08:00:00Z',
    updatedAt: '2024-12-15T08:00:00Z',
    driver: {
      name: '张师傅',
      id: 'DRV-5567',
      rating: 4.7,
      statement:
        '我完全是按照导航走的，当时导航推荐了两条路线，我选了时间最短的那条。虽然距离稍长，但避开了拥堵路段，实际是更快到达的。绕路绝对不存在，系统可以查看导航记录。',
    },
    passenger: {
      name: '李先生',
      id: 'PAS-1024',
      rating: 4.5,
      statement:
        '我经常走这条路，正常打车只要65元左右，但这次收了95元。我看了地图，明显绕了远路，多走了至少5公里。司机说是导航让走的，但导航怎么会让走更远的路？我要求退还多收的车费。',
    },
    trip: {
      pickupLocation: '南山科技园',
      dropoffLocation: '宝安国际机场',
      pickupTime: '2024-12-15T06:30:00Z',
      dropoffTime: '2024-12-15T07:15:00Z',
      fare: 95,
      distance: 28.5,
      vehicleModel: '丰田凯美瑞',
      plateNumber: '粤B·G3F92',
    },
    evidence: {
      description: '导航路线记录和实际行驶轨迹待比对',
      items: ['平台导航记录', 'GPS实际轨迹', '同路线历史车费记录'],
    },
  },
  {
    id: 'case-003',
    caseNumber: 'DR-2024-003',
    status: 'pending',
    priority: 'medium',
    type: 'behavior_complaint',
    title: '乘客投诉司机态度恶劣并中途拒载',
    createdAt: '2024-12-16T14:00:00Z',
    updatedAt: '2024-12-16T14:00:00Z',
    driver: {
      name: '王师傅',
      id: 'DRV-4490',
      rating: 4.2,
      statement:
        '乘客迟到了将近10分钟，我等了很久。上车后她说改地址，新地址比我原本要去的方向完全不同，会严重影响我后面的接单。我跟她解释了情况，态度可能有点着急，但没有骂人。后来她说不坐了，我也没办法。',
    },
    passenger: {
      name: '陈女士',
      id: 'PAS-7783',
      rating: 4.8,
      statement:
        '司机态度非常差，一上车就板着脸。我只是说想改一下目的地，他就很大声地说"你早干嘛去了"。然后他说不拉我了，让我下车。我当时下雨，在路边等了20分钟才打到下一辆车。我要投诉他拒载。',
    },
    trip: {
      pickupLocation: '罗湖区万象城',
      dropoffLocation: '福田区车公庙（原目的地）',
      pickupTime: '2024-12-16T13:45:00Z',
      dropoffTime: '2024-12-16T14:00:00Z',
      fare: 0,
      distance: 0,
      vehicleModel: '比亚迪秦',
      plateNumber: '粤B·E8H12',
    },
    evidence: {
      description: '行程录音和等待时间记录可查',
      items: ['车内录音', '订单等待时间记录', '司机接单记录'],
    },
  },
];

function generateId(): string {
  counter++;
  return `case-${String(counter).padStart(3, '0')}`;
}

function generateCaseNumber(): string {
  const year = new Date().getFullYear();
  const num = String(cases.length + 1).padStart(3, '0');
  return `DR-${year}-${num}`;
}

export const disputeStore = {
  getAll(): DisputeCase[] {
    return [...cases].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  getById(id: string): DisputeCase | undefined {
    return cases.find((c) => c.id === id);
  },

  create(dto: CreateDisputeDTO): DisputeCase {
    const now = new Date().toISOString();
    const newCase: DisputeCase = {
      id: generateId(),
      caseNumber: generateCaseNumber(),
      status: 'pending',
      priority: dto.priority,
      type: dto.type,
      title: dto.title,
      createdAt: now,
      updatedAt: now,
      driver: dto.driver,
      passenger: dto.passenger,
      trip: dto.trip,
      evidence: dto.evidence,
    };
    cases.push(newCase);
    return newCase;
  },

  updateReview(id: string, review: DisputeCase['review']): DisputeCase | undefined {
    const c = cases.find((c) => c.id === id);
    if (!c) return undefined;
    c.review = review;
    c.status = 'resolved';
    c.updatedAt = new Date().toISOString();
    return c;
  },

  setStatus(id: string, status: DisputeCase['status']): DisputeCase | undefined {
    const c = cases.find((c) => c.id === id);
    if (!c) return undefined;
    c.status = status;
    c.updatedAt = new Date().toISOString();
    return c;
  },

  getStats(): DashboardStats {
    const stats: DashboardStats = {
      total: cases.length,
      pending: 0,
      underReview: 0,
      resolved: 0,
      byType: {},
      byPriority: {},
    };
    for (const c of cases) {
      if (c.status === 'pending') stats.pending++;
      else if (c.status === 'under_review') stats.underReview++;
      else if (c.status === 'resolved') stats.resolved++;
      stats.byType[c.type] = (stats.byType[c.type] || 0) + 1;
      stats.byPriority[c.priority] = (stats.byPriority[c.priority] || 0) + 1;
    }
    return stats;
  },
};
