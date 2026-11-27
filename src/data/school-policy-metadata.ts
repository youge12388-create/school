import { normalizeSchoolBaseName, PROJECT_211_ONLY_SCHOOLS, PROJECT_985_SCHOOLS } from "@/lib/screening-ranking";

export type SchoolTierCode = "T1" | "T2" | "T3" | "T4" | "T5";

export type PathwayType =
  | "DIRECT_DEGREE"
  | "FOUNDATION_1_PLUS_4"
  | "ZERO_BASE_CHINESE_UG"
  | "VOCATIONAL_DIPLOMA"
  | "VOCATIONAL_UG"
  | "TOP_UP_UPGRADE"
  | "NON_DEGREE_LANGUAGE"
  | "CHINESE_EQUIVALENT_MASTER"
  | "WIDE_AGE_SELF_FUNDED_MASTER";

export type CscaPolicy = "HARD_CUTOFF" | "FLEXIBLE_EXAM" | "EXEMPT";

export type ChannelOverridePolicy = {
  guaranteedFoundation?: boolean;
  feeWaiverNote?: string;
  overrideMinNormPct?: number;
  overridePathways?: PathwayType[];
};

/**
 * 10-dimensional hard-filtering metadata per institution.
 * Used BEFORE LLM invocation so the model only ranks/explains compliant pools.
 */
export type SchoolPolicyMetadata = {
  schoolName: string;
  city?: string;
  tier: SchoolTierCode;
  pathwayTypes: PathwayType[];
  cscaPolicy: CscaPolicy;
  minCscaScore: number | null;
  requiresSchoolExam: boolean;
  schoolExamNote?: string;
  minNormPct: number;
  zeroFailRequired: boolean;
  acceptVocationalHs: boolean;
  maxAgeSelfFundedUg: number;
  maxAgeSelfFundedMaster: number;
  maxAgeScholarshipUg: number;
  maxAgeScholarshipMaster: number;
  moiAccepted: boolean;
  moiNote?: string;
  isMoe43Mbbs: boolean;
  firstYearMinCostRmb: number | null;
  hasOnCampusDorm: boolean;
  dormNote?: string;
  firstYearWaiverType?: "FULL_TUITION_AND_DORM" | "HALF_TUITION" | "NONE";
  scholarshipRenewalRisk?: string;
  acceptsChineseEquivalentMaster?: boolean;
  acceptsTopUpUpgrade?: boolean;
  channelOverride?: ChannelOverridePolicy;
};

/**
 * Complete list of China's extra Double-First-Class universities beyond 985/211
 * so no Double-First-Class university slips into T3/T4 when DB tags are missing.
 */
export const FULL_DOUBLE_FIRST_CLASS_EXTRA = new Set([
  "中国科学院大学", "南方科技大学", "上海科技大学", "南京信息工程大学", "南京邮电大学",
  "宁波大学", "河南大学", "湘潭大学", "燕山大学", "山西大学", "外交学院",
  "中国社会科学院大学", "广州医科大学", "成都理工大学", "西南石油大学",
  "首都师范大学", "天津工业大学", "天津中医药大学", "上海体育大学", "上海音乐学院",
  "南京林业大学", "南京中医药大学", "中国美术学院", "华南农业大学", "上海纽约大学",
  "南京医科大学", "广州中医药大学", "成都中医药大学", "上海海洋大学", "上海中医药大学",
  "北京协和医学院", "中国人民公安大学", "中央美术学院", "中央戏剧学院", "中国音乐学院",
  "北京舞蹈学院", "中国戏曲学院", "复旦大学上海医学院",
]);

/**
 * Known strong public Tier-1 (省重点/公办一本) universities that sit in T2/T3
 * and must not be confused with T4/T5 fallback colleges for low-scoring applicants.
 */
export const KNOWN_PUBLIC_TIER1_UNIVERSITIES = new Set([
  "深圳大学", "浙江工业大学", "杭州电子科技大学", "浙江工商大学", "江苏大学",
  "南京工业大学", "青岛大学", "广东外语外贸大学", "华东政法大学", "上海对外经贸大学",
  "北京语言大学", "北京建筑大学", "广东工业大学", "上海理工大学", "上海海事大学",
  "上海师范大学", "南京审计大学", "扬州大学", "温州医科大学", "福建师范大学",
  "山东师范大学", "河南工业大学", "河南师范大学", "湖北大学", "湖北工业大学",
  "三峡大学", "长沙理工大学", "昆明理工大学", "重庆邮电大学", "西安建筑科技大学",
  "青岛科技大学", "山东理工大学", "烟台大学", "大连工业大学", "辽宁工业大学",
  "内蒙古财经大学", "广西医科大学", "河南中医药大学", "郑州轻工业大学", "中原工学院",
]);

/**
 * Ministry of Education approved 43 English-taught MBBS universities (2,790 seats baseline).
 */
export const MOE_43_ENGLISH_MBBS_SCHOOLS = new Set([
  "吉林大学", "中国医科大学", "大连医科大学", "首都医科大学", "天津医科大学",
  "山东大学", "复旦大学", "南京医科大学", "江苏大学", "温州医科大学",
  "浙江大学", "武汉大学", "华中科技大学", "西安交通大学", "南方医科大学",
  "中山大学", "四川大学", "重庆医科大学", "哈尔滨医科大学", "北华大学",
  "辽宁医学院", "锦州医科大学", "青岛大学", "河北医科大学", "宁夏医科大学",
  "同济大学", "苏州大学", "东南大学", "扬州大学", "南通大学",
  "宁波大学", "福建医科大学", "安徽医科大学", "徐州医科大学", "三峡大学",
  "郑州大学", "广州医科大学", "汕头大学", "广西医科大学", "昆明医科大学",
  "新疆医科大学", "石河子大学", "山西医科大学", "厦门大学", "中南大学",
  "南京大学", "华南理工大学", "海南医科大学", "海南医学院",
]);

/**
 * Universities known to strictly reject local Medium of Instruction (MOI) certificates
 * from South Asia / Southeast Asia / Africa and require standardized IELTS/TOEFL.
 */
export const MOI_STRICT_REJECT_SCHOOLS = new Set([
  "清华大学", "北京大学", "上海交通大学", "复旦大学", "浙江大学",
  "南京大学", "北京理工大学", "中国科学技术大学", "中国人民大学",
  "北京航空航天大学", "同济大学", "哈尔滨工业大学", "南方科技大学",
  "西安交通大学", "武汉大学", "中山大学", "华中科技大学", "厦门大学",
  "中欧国际工商学院",
]);

/**
 * Universities/programs requiring strict calculator-free or math/physics school entrance exams.
 */
export const STRONG_SCHOOL_EXAM_SCHOOLS: Record<string, string> = {
  南方科技大学: "需参加禁计算器数理校考（笔试+面试），无扎实竞赛/数理基础慎冲",
  "哈尔滨工业大学（深圳）": "需参加强数理校考面试与能力测试，竞赛与数理门槛高",
  上海交通大学: "密西根学院(GC)/巴黎卓越工程师学院(SPEIT)等设禁计算器强数理校考",
  清华大学: "本科与重点项目设综合笔试/专业面试及高门槛考核",
  北京大学: "设笔试/综合面试考核，选拔竞争极高",
};

/**
 * Structured 10-dimensional policy catalog for key anchor institutions spanning T1 to T5,
 * including low-budget vocational niches, wide-age self-funded pools, Chinese-equivalent master,
 * and top-up (专转本/专升本) articulation universities.
 */
export const CURATED_SCHOOL_POLICIES: Record<string, Partial<SchoolPolicyMetadata>> = {
  // === T1 顶尖名校 ===
  清华大学: {
    city: "北京",
    tier: "T1",
    pathwayTypes: ["DIRECT_DEGREE"],
    cscaPolicy: "HARD_CUTOFF",
    minCscaScore: 80,
    requiresSchoolExam: true,
    schoolExamNote: STRONG_SCHOOL_EXAM_SCHOOLS["清华大学"],
    minNormPct: 88,
    zeroFailRequired: true,
    acceptVocationalHs: false,
    maxAgeSelfFundedUg: 25,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: false,
    moiNote: "明确不认可非母语国本地 MOI 英文授课证明，须提供标准雅思/托福",
    firstYearMinCostRmb: 30000,
    hasOnCampusDorm: true,
  },
  北京大学: {
    city: "北京",
    tier: "T1",
    pathwayTypes: ["DIRECT_DEGREE"],
    cscaPolicy: "HARD_CUTOFF",
    minCscaScore: 80,
    requiresSchoolExam: true,
    schoolExamNote: STRONG_SCHOOL_EXAM_SCHOOLS["北京大学"],
    minNormPct: 88,
    zeroFailRequired: true,
    acceptVocationalHs: false,
    maxAgeSelfFundedUg: 25,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: false,
    firstYearMinCostRmb: 30000,
    hasOnCampusDorm: true,
  },
  上海交通大学: {
    city: "上海",
    tier: "T1",
    pathwayTypes: ["DIRECT_DEGREE"],
    cscaPolicy: "HARD_CUTOFF",
    minCscaScore: 78,
    requiresSchoolExam: true,
    schoolExamNote: STRONG_SCHOOL_EXAM_SCHOOLS["上海交通大学"],
    minNormPct: 86,
    zeroFailRequired: true,
    acceptVocationalHs: false,
    maxAgeSelfFundedUg: 25,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: false,
    moiNote: "明确不认可非母语国本地 MOI，须提供标准雅思/托福",
    firstYearMinCostRmb: 28900,
    hasOnCampusDorm: true,
  },
  复旦大学: {
    city: "上海",
    tier: "T1",
    pathwayTypes: ["DIRECT_DEGREE"],
    cscaPolicy: "HARD_CUTOFF",
    minCscaScore: 78,
    requiresSchoolExam: true,
    minNormPct: 86,
    zeroFailRequired: true,
    acceptVocationalHs: false,
    maxAgeSelfFundedUg: 25,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: false,
    isMoe43Mbbs: true,
    firstYearMinCostRmb: 26000,
    hasOnCampusDorm: true,
  },
  南京大学: {
    city: "南京",
    tier: "T1",
    pathwayTypes: ["DIRECT_DEGREE"],
    cscaPolicy: "HARD_CUTOFF",
    minCscaScore: 76,
    requiresSchoolExam: false,
    minNormPct: 85,
    zeroFailRequired: true,
    acceptVocationalHs: false,
    maxAgeSelfFundedUg: 25,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: false,
    moiNote: "明确不认可非母语国本地 MOI，须提供标准语言成绩",
    isMoe43Mbbs: true,
    firstYearMinCostRmb: 24000,
    hasOnCampusDorm: true,
  },
  北京理工大学: {
    city: "北京",
    tier: "T1",
    pathwayTypes: ["DIRECT_DEGREE", "FOUNDATION_1_PLUS_4"],
    cscaPolicy: "HARD_CUTOFF",
    minCscaScore: 75,
    requiresSchoolExam: false,
    minNormPct: 84,
    zeroFailRequired: true,
    acceptVocationalHs: false,
    maxAgeSelfFundedUg: 25,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: false,
    moiNote: "明确不认可非母语国本地 MOI 证明",
    firstYearMinCostRmb: 26000,
    hasOnCampusDorm: true,
  },
  南方科技大学: {
    city: "深圳",
    tier: "T1",
    pathwayTypes: ["DIRECT_DEGREE"],
    cscaPolicy: "FLEXIBLE_EXAM",
    minCscaScore: 75,
    requiresSchoolExam: true,
    schoolExamNote: STRONG_SCHOOL_EXAM_SCHOOLS["南方科技大学"],
    minNormPct: 85,
    zeroFailRequired: true,
    acceptVocationalHs: false,
    maxAgeSelfFundedUg: 25,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: false,
    firstYearMinCostRmb: 26000,
    hasOnCampusDorm: true,
  },
  "哈尔滨工业大学（深圳）": {
    city: "深圳",
    tier: "T1",
    pathwayTypes: ["DIRECT_DEGREE"],
    cscaPolicy: "HARD_CUTOFF",
    minCscaScore: 75,
    requiresSchoolExam: true,
    schoolExamNote: STRONG_SCHOOL_EXAM_SCHOOLS["哈尔滨工业大学（深圳）"],
    minNormPct: 84,
    zeroFailRequired: true,
    acceptVocationalHs: false,
    maxAgeSelfFundedUg: 25,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: false,
    firstYearMinCostRmb: 28000,
    hasOnCampusDorm: true,
  },

  // === T2/T3 重点及特色公办（含同等学力与专转本承接） ===
  华侨大学: {
    city: "泉州/厦门",
    tier: "T3",
    pathwayTypes: ["DIRECT_DEGREE", "FOUNDATION_1_PLUS_4", "CHINESE_EQUIVALENT_MASTER", "NON_DEGREE_LANGUAGE"],
    cscaPolicy: "FLEXIBLE_EXAM",
    minCscaScore: 55,
    requiresSchoolExam: false,
    minNormPct: 68,
    zeroFailRequired: false,
    acceptVocationalHs: false,
    maxAgeSelfFundedUg: 28,
    maxAgeSelfFundedMaster: 40,
    moiAccepted: true,
    firstYearMinCostRmb: 22000,
    hasOnCampusDorm: true,
    acceptsChineseEquivalentMaster: true,
  },
  南京林业大学: {
    city: "南京",
    tier: "T2",
    pathwayTypes: ["DIRECT_DEGREE", "FOUNDATION_1_PLUS_4", "TOP_UP_UPGRADE"],
    cscaPolicy: "FLEXIBLE_EXAM",
    minCscaScore: 60,
    requiresSchoolExam: false,
    minNormPct: 72,
    zeroFailRequired: false,
    acceptVocationalHs: false,
    maxAgeSelfFundedUg: 28,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: true,
    firstYearMinCostRmb: 20000,
    hasOnCampusDorm: true,
    acceptsTopUpUpgrade: true,
  },
  无锡学院: {
    city: "无锡",
    tier: "T4",
    pathwayTypes: ["DIRECT_DEGREE", "FOUNDATION_1_PLUS_4", "TOP_UP_UPGRADE"],
    cscaPolicy: "EXEMPT",
    minCscaScore: null,
    requiresSchoolExam: false,
    minNormPct: 60,
    zeroFailRequired: false,
    acceptVocationalHs: true,
    maxAgeSelfFundedUg: 30,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: true,
    firstYearMinCostRmb: 18000,
    hasOnCampusDorm: true,
    acceptsTopUpUpgrade: true,
  },

  // === 宽龄自费池 & 低成本半奖/预科/高职承接校 ===
  浙江科技大学: {
    city: "杭州",
    tier: "T3",
    pathwayTypes: ["DIRECT_DEGREE", "FOUNDATION_1_PLUS_4", "WIDE_AGE_SELF_FUNDED_MASTER", "NON_DEGREE_LANGUAGE"],
    cscaPolicy: "FLEXIBLE_EXAM",
    minCscaScore: 55,
    requiresSchoolExam: false,
    minNormPct: 65,
    zeroFailRequired: false,
    acceptVocationalHs: false,
    maxAgeSelfFundedUg: 35,
    maxAgeSelfFundedMaster: 45,
    maxAgeScholarshipUg: 25,
    maxAgeScholarshipMaster: 35,
    moiAccepted: true,
    firstYearMinCostRmb: 20000,
    hasOnCampusDorm: true,
    scholarshipRenewalRisk: "单学期缺勤满 20 课时或出现挂科，将直接取消下学期奖学金资格（须参加年度评审）",
  },
  红河学院: {
    city: "蒙自",
    tier: "T4",
    pathwayTypes: ["DIRECT_DEGREE", "FOUNDATION_1_PLUS_4", "ZERO_BASE_CHINESE_UG", "NON_DEGREE_LANGUAGE"],
    cscaPolicy: "EXEMPT",
    minCscaScore: null,
    requiresSchoolExam: false,
    minNormPct: 55,
    zeroFailRequired: false,
    acceptVocationalHs: true,
    maxAgeSelfFundedUg: 35,
    maxAgeSelfFundedMaster: 40,
    moiAccepted: true,
    firstYearMinCostRmb: 13500,
    hasOnCampusDorm: true,
    firstYearWaiverType: "HALF_TUITION",
    scholarshipRenewalRisk: "首年半奖减免后成本友好，次年须满足出勤与全科合格要求方可续享",
  },
  海南外国语职业学院: {
    city: "文昌",
    tier: "T5",
    pathwayTypes: ["VOCATIONAL_DIPLOMA", "NON_DEGREE_LANGUAGE"],
    cscaPolicy: "EXEMPT",
    minCscaScore: null,
    requiresSchoolExam: false,
    minNormPct: 50,
    zeroFailRequired: false,
    acceptVocationalHs: true,
    maxAgeSelfFundedUg: 35,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: true,
    firstYearMinCostRmb: 14000,
    hasOnCampusDorm: true,
  },
  吉林外国语大学: {
    city: "长春",
    tier: "T4",
    pathwayTypes: ["DIRECT_DEGREE", "FOUNDATION_1_PLUS_4", "ZERO_BASE_CHINESE_UG", "WIDE_AGE_SELF_FUNDED_MASTER", "NON_DEGREE_LANGUAGE"],
    cscaPolicy: "EXEMPT",
    minCscaScore: null,
    requiresSchoolExam: false,
    minNormPct: 55,
    zeroFailRequired: false,
    acceptVocationalHs: true,
    maxAgeSelfFundedUg: 40,
    maxAgeSelfFundedMaster: 50,
    maxAgeScholarshipUg: 25,
    maxAgeScholarshipMaster: 35,
    moiAccepted: true,
    firstYearMinCostRmb: 22000,
    hasOnCampusDorm: true,
  },
  三亚学院: {
    city: "三亚",
    tier: "T4",
    pathwayTypes: ["DIRECT_DEGREE", "FOUNDATION_1_PLUS_4", "WIDE_AGE_SELF_FUNDED_MASTER", "NON_DEGREE_LANGUAGE"],
    cscaPolicy: "EXEMPT",
    minCscaScore: null,
    requiresSchoolExam: false,
    minNormPct: 55,
    zeroFailRequired: false,
    acceptVocationalHs: true,
    maxAgeSelfFundedUg: 35,
    maxAgeSelfFundedMaster: 50,
    maxAgeScholarshipUg: 25,
    maxAgeScholarshipMaster: 35,
    moiAccepted: true,
    firstYearMinCostRmb: 24000,
    hasOnCampusDorm: true,
  },
  广西工商职业技术学院: {
    city: "南宁",
    tier: "T5",
    pathwayTypes: ["VOCATIONAL_DIPLOMA", "NON_DEGREE_LANGUAGE"],
    cscaPolicy: "EXEMPT",
    minCscaScore: null,
    requiresSchoolExam: false,
    minNormPct: 50,
    zeroFailRequired: false,
    acceptVocationalHs: true,
    maxAgeSelfFundedUg: 35,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: true,
    firstYearMinCostRmb: 12800,
    hasOnCampusDorm: true,
    firstYearWaiverType: "FULL_TUITION_AND_DORM",
    scholarshipRenewalRisk: "首年提供免学费住宿通道（仅须自理生活费、医保及前置居留手续费），次年按校内综合考评续享",
  },
  义乌工商职业技术学院: {
    city: "义乌",
    tier: "T5",
    pathwayTypes: ["VOCATIONAL_DIPLOMA", "NON_DEGREE_LANGUAGE"],
    cscaPolicy: "EXEMPT",
    minCscaScore: null,
    requiresSchoolExam: false,
    minNormPct: 50,
    zeroFailRequired: false,
    acceptVocationalHs: true,
    maxAgeSelfFundedUg: 35,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: true,
    firstYearMinCostRmb: 26000,
    hasOnCampusDorm: false,
    dormNote: "语言生无校内宿舍，须校外租房（显著增加首年住房押金与实际生活开销）",
  },
  深圳职业技术大学: {
    city: "深圳",
    tier: "T4",
    pathwayTypes: ["VOCATIONAL_UG", "DIRECT_DEGREE", "FOUNDATION_1_PLUS_4", "NON_DEGREE_LANGUAGE"],
    cscaPolicy: "EXEMPT",
    minCscaScore: null,
    requiresSchoolExam: false,
    minNormPct: 58,
    zeroFailRequired: false,
    acceptVocationalHs: true,
    maxAgeSelfFundedUg: 30,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: true,
    firstYearMinCostRmb: 19000,
    hasOnCampusDorm: true,
  },
  淄博职业技术大学: {
    city: "淄博",
    tier: "T4",
    pathwayTypes: ["VOCATIONAL_UG", "VOCATIONAL_DIPLOMA", "FOUNDATION_1_PLUS_4", "NON_DEGREE_LANGUAGE"],
    cscaPolicy: "EXEMPT",
    minCscaScore: null,
    requiresSchoolExam: false,
    minNormPct: 55,
    zeroFailRequired: false,
    acceptVocationalHs: true,
    maxAgeSelfFundedUg: 30,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: true,
    firstYearMinCostRmb: 15000,
    hasOnCampusDorm: true,
  },
  温州职业技术学院: {
    city: "温州",
    tier: "T5",
    pathwayTypes: ["VOCATIONAL_DIPLOMA", "NON_DEGREE_LANGUAGE"],
    cscaPolicy: "EXEMPT",
    minCscaScore: null,
    requiresSchoolExam: false,
    minNormPct: 50,
    zeroFailRequired: false,
    acceptVocationalHs: true,
    maxAgeSelfFundedUg: 30,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: true,
    firstYearMinCostRmb: 16000,
    hasOnCampusDorm: true,
  },
  广西机电职业技术学院: {
    city: "南宁",
    tier: "T5",
    pathwayTypes: ["VOCATIONAL_DIPLOMA", "NON_DEGREE_LANGUAGE"],
    cscaPolicy: "EXEMPT",
    minCscaScore: null,
    requiresSchoolExam: false,
    minNormPct: 50,
    zeroFailRequired: false,
    acceptVocationalHs: true,
    maxAgeSelfFundedUg: 32,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: true,
    firstYearMinCostRmb: 14500,
    hasOnCampusDorm: true,
  },
  广西物流职业技术学院: {
    city: "贵港",
    tier: "T5",
    pathwayTypes: ["VOCATIONAL_DIPLOMA", "NON_DEGREE_LANGUAGE"],
    cscaPolicy: "EXEMPT",
    minCscaScore: null,
    requiresSchoolExam: false,
    minNormPct: 50,
    zeroFailRequired: false,
    acceptVocationalHs: true,
    maxAgeSelfFundedUg: 32,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: true,
    firstYearMinCostRmb: 14000,
    hasOnCampusDorm: true,
  },
  广东岭南职业技术学院: {
    city: "广州",
    tier: "T5",
    pathwayTypes: ["VOCATIONAL_DIPLOMA", "NON_DEGREE_LANGUAGE"],
    cscaPolicy: "EXEMPT",
    minCscaScore: null,
    requiresSchoolExam: false,
    minNormPct: 50,
    zeroFailRequired: false,
    acceptVocationalHs: true,
    maxAgeSelfFundedUg: 32,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: true,
    firstYearMinCostRmb: 17500,
    hasOnCampusDorm: true,
  },
  广州城建职业学院: {
    city: "广州",
    tier: "T5",
    pathwayTypes: ["VOCATIONAL_DIPLOMA", "NON_DEGREE_LANGUAGE"],
    cscaPolicy: "EXEMPT",
    minCscaScore: null,
    requiresSchoolExam: false,
    minNormPct: 50,
    zeroFailRequired: false,
    acceptVocationalHs: true,
    maxAgeSelfFundedUg: 32,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: true,
    firstYearMinCostRmb: 17500,
    hasOnCampusDorm: true,
  },
  沈阳城市建设学院: {
    city: "沈阳",
    tier: "T4",
    pathwayTypes: ["DIRECT_DEGREE", "FOUNDATION_1_PLUS_4", "ZERO_BASE_CHINESE_UG", "NON_DEGREE_LANGUAGE"],
    cscaPolicy: "EXEMPT",
    minCscaScore: null,
    requiresSchoolExam: false,
    minNormPct: 55,
    zeroFailRequired: false,
    acceptVocationalHs: true,
    maxAgeSelfFundedUg: 30,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: true,
    firstYearMinCostRmb: 18500,
    hasOnCampusDorm: true,
  },
  广州商学院: {
    city: "广州",
    tier: "T4",
    pathwayTypes: ["DIRECT_DEGREE", "FOUNDATION_1_PLUS_4", "ZERO_BASE_CHINESE_UG", "NON_DEGREE_LANGUAGE"],
    cscaPolicy: "EXEMPT",
    minCscaScore: null,
    requiresSchoolExam: false,
    minNormPct: 55,
    zeroFailRequired: false,
    acceptVocationalHs: true,
    maxAgeSelfFundedUg: 30,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: true,
    firstYearMinCostRmb: 24000,
    hasOnCampusDorm: true,
  },
  广州工商学院: {
    city: "广州",
    tier: "T4",
    pathwayTypes: ["DIRECT_DEGREE", "FOUNDATION_1_PLUS_4", "ZERO_BASE_CHINESE_UG", "NON_DEGREE_LANGUAGE"],
    cscaPolicy: "EXEMPT",
    minCscaScore: null,
    requiresSchoolExam: false,
    minNormPct: 55,
    zeroFailRequired: false,
    acceptVocationalHs: true,
    maxAgeSelfFundedUg: 30,
    maxAgeSelfFundedMaster: 35,
    moiAccepted: true,
    firstYearMinCostRmb: 23000,
    hasOnCampusDorm: true,
  },
};

export function tierToRank(tier: SchoolTierCode): number {
  return { T1: 1, T2: 2, T3: 3, T4: 4, T5: 5 }[tier];
}

export function rankToTier(rank: number): SchoolTierCode {
  const clamped = Math.max(1, Math.min(5, Math.round(rank)));
  return (["T1", "T2", "T3", "T4", "T5"] as const)[clamped - 1];
}

export function inferSchoolPolicyMetadata(
  schoolName: string,
  options?: {
    schoolTags?: string | null;
    qsRanking?: number | null;
    firstYearCostMax?: number | null;
    programName?: string | null;
    programType?: string | null;
    city?: string | null;
  },
): SchoolPolicyMetadata {
  const rawName = String(schoolName ?? "").trim();
  const baseName = normalizeSchoolBaseName(rawName);
  const tags = String(options?.schoolTags ?? "");
  const progName = String(options?.programName ?? "");
  const curated = CURATED_SCHOOL_POLICIES[rawName] ?? CURATED_SCHOOL_POLICIES[baseName];

  const is985 = /(?:^|[，,、；;\s])985(?:$|[，,、；;\s])/u.test(tags) || PROJECT_985_SCHOOLS.has(baseName);
  const is211 = !is985 && (/(?:^|[，,、；;\s])211(?:$|[，,、；;\s])/u.test(tags) || PROJECT_211_ONLY_SCHOOLS.has(baseName));
  const isDoubleFirst = tags.includes("双一流") || FULL_DOUBLE_FIRST_CLASS_EXTRA.has(baseName);
  const isPublicTier1 = KNOWN_PUBLIC_TIER1_UNIVERSITIES.has(baseName) || tags.includes("公办一本") || tags.includes("省重点");
  const isVocationalDiploma =
    /(?:专科|高职|中专|中职)/u.test(tags)
    || /(?:职业技术学院|职业学院|高等专科学校|专科学校|技师学院|中等专业学校|职业技术学校|职业学校|旅游学校|卫生学校)/u.test(rawName);
  const isVocationalUg = /(?:职业技术大学|职业大学)/u.test(rawName) && !isVocationalDiploma;
  const isPrivateOrCollege =
    /(?:民办|独立学院|二本|应用型)/u.test(tags)
    || (/(?:学院)(?:$|（|\()/u.test(rawName) && !/大学/u.test(rawName) && !/中欧国际工商学院|外交学院/u.test(rawName));

  const validQs = options?.qsRanking != null && Number.isFinite(options.qsRanking) && options.qsRanking > 0 ? options.qsRanking : null;

  let inferredTier: SchoolTierCode = "T3";
  if (is985 || (validQs != null && validQs <= 250) || /中欧国际工商学院|CEIBS/iu.test(rawName)) {
    inferredTier = "T1";
  } else if (is211 || isDoubleFirst || (validQs != null && validQs <= 600)) {
    inferredTier = "T2";
  } else if (isVocationalDiploma) {
    inferredTier = "T5";
  } else if (isVocationalUg || isPrivateOrCollege) {
    inferredTier = "T4";
  } else if (isPublicTier1) {
    inferredTier = "T3";
  } else {
    inferredTier = "T3";
  }

  const tier = curated?.tier ?? inferredTier;
  const defaultPathways: PathwayType[] = [];
  if (isVocationalDiploma) {
    defaultPathways.push("VOCATIONAL_DIPLOMA", "NON_DEGREE_LANGUAGE");
  } else if (isVocationalUg) {
    defaultPathways.push("VOCATIONAL_UG", "DIRECT_DEGREE", "FOUNDATION_1_PLUS_4", "NON_DEGREE_LANGUAGE");
  } else if (tier === "T4") {
    defaultPathways.push("DIRECT_DEGREE", "FOUNDATION_1_PLUS_4", "ZERO_BASE_CHINESE_UG", "NON_DEGREE_LANGUAGE");
  } else if (tier === "T3") {
    defaultPathways.push("DIRECT_DEGREE", "FOUNDATION_1_PLUS_4", "NON_DEGREE_LANGUAGE");
  } else {
    defaultPathways.push("DIRECT_DEGREE");
  }
  if (/预科|1\+4|基础年|foundation/iu.test(progName)) {
    if (!defaultPathways.includes("FOUNDATION_1_PLUS_4")) defaultPathways.push("FOUNDATION_1_PLUS_4");
  }
  if (/零基础|汉语言.*本科/u.test(progName)) {
    if (!defaultPathways.includes("ZERO_BASE_CHINESE_UG")) defaultPathways.push("ZERO_BASE_CHINESE_UG");
  }
  if (options?.programType === "LONG_TERM" || options?.programType === "SHORT_TERM" || /语言进修|汉语进修|非学历/u.test(progName)) {
    if (!defaultPathways.includes("NON_DEGREE_LANGUAGE")) defaultPathways.push("NON_DEGREE_LANGUAGE");
  }

  const defaultMinNormPct: Record<SchoolTierCode, number> = {
    T1: 85,
    T2: 75,
    T3: 65,
    T4: 55,
    T5: 50,
  };
  const defaultCscaPolicy: CscaPolicy = tier === "T1" || tier === "T2"
    ? "HARD_CUTOFF"
    : tier === "T3"
      ? "FLEXIBLE_EXAM"
      : "EXEMPT";
  const defaultMinCsca = tier === "T1" ? 75 : tier === "T2" ? 65 : tier === "T3" ? 50 : null;
  const schoolExamNote = curated?.schoolExamNote ?? STRONG_SCHOOL_EXAM_SCHOOLS[rawName] ?? STRONG_SCHOOL_EXAM_SCHOOLS[baseName];

  return {
    schoolName: rawName,
    city: curated?.city ?? options?.city ?? undefined,
    tier,
    pathwayTypes: curated?.pathwayTypes ?? defaultPathways,
    cscaPolicy: curated?.cscaPolicy ?? defaultCscaPolicy,
    minCscaScore: curated?.minCscaScore !== undefined ? curated.minCscaScore : defaultMinCsca,
    requiresSchoolExam: curated?.requiresSchoolExam ?? Boolean(schoolExamNote),
    schoolExamNote,
    minNormPct: curated?.minNormPct ?? defaultMinNormPct[tier],
    zeroFailRequired: curated?.zeroFailRequired ?? (tier === "T1" || tier === "T2"),
    acceptVocationalHs: curated?.acceptVocationalHs ?? (tier === "T4" || tier === "T5"),
    maxAgeSelfFundedUg: curated?.maxAgeSelfFundedUg ?? (tier === "T1" || tier === "T2" ? 25 : tier === "T3" ? 28 : 30),
    maxAgeSelfFundedMaster: curated?.maxAgeSelfFundedMaster ?? (tier === "T1" || tier === "T2" ? 35 : 40),
    maxAgeScholarshipUg: curated?.maxAgeScholarshipUg ?? 25,
    maxAgeScholarshipMaster: curated?.maxAgeScholarshipMaster ?? 35,
    moiAccepted: curated?.moiAccepted ?? !MOI_STRICT_REJECT_SCHOOLS.has(baseName),
    moiNote: curated?.moiNote ?? (MOI_STRICT_REJECT_SCHOOLS.has(baseName) ? "该校严格审核标准英语成绩，通常不认可非母语国本地 MOI 证明" : undefined),
    isMoe43Mbbs: curated?.isMoe43Mbbs ?? MOE_43_ENGLISH_MBBS_SCHOOLS.has(baseName),
    firstYearMinCostRmb: curated?.firstYearMinCostRmb ?? options?.firstYearCostMax ?? null,
    hasOnCampusDorm: curated?.hasOnCampusDorm ?? true,
    dormNote: curated?.dormNote,
    firstYearWaiverType: curated?.firstYearWaiverType ?? "NONE",
    scholarshipRenewalRisk: curated?.scholarshipRenewalRisk,
    acceptsChineseEquivalentMaster: curated?.acceptsChineseEquivalentMaster ?? false,
    acceptsTopUpUpgrade: curated?.acceptsTopUpUpgrade ?? false,
    channelOverride: curated?.channelOverride,
  };
}
