import { z } from "zod";

import { writeAudit } from "@/lib/audit";
import { criteriaSchema, type ChatCriteria } from "@/lib/ai-screening";
import { getCurrentUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { isSameOrigin } from "@/lib/http";

const profileRequestSchema = z
  .object({
    customerId: z.string().min(1).max(120),
    criteria: criteriaSchema,
  })
  .strict();

type CustomerProfileRow = {
  id: string;
  name: string;
  customerNo: string;
  targetDegree: string | null;
  targetMajor: string | null;
  teachingLanguage: string | null;
  intakeYear: number | null;
  firstYearBudget: number | null;
  gpa: number | null;
  gpaScale: number | null;
  hskLevel: number | null;
  hskScore: number | null;
  ielts: number | null;
  toefl: number | null;
  duolingo: number | null;
  hasCsca: number | null;
  scholarshipRequired: number | null;
  accommodationRequired: number | null;
  preferredProvince: string | null;
  preferredCity: string | null;
};

const unsupportedFields = [
  "入学季",
  "CSCA 学校要求",
  "奖学金类型（仅保存是否要求）",
  "学生年龄",
] as const;

function criteriaFromRow(row: CustomerProfileRow): ChatCriteria {
  return {
    programType: ["UG", "MASTER", "PHD", "LONG_TERM", "SHORT_TERM"].includes(
      row.targetDegree ?? "",
    )
      ? (row.targetDegree as ChatCriteria["programType"])
      : null,
    targetMajor: row.targetMajor,
    teachingLanguage: ["CHINESE", "ENGLISH"].includes(
      row.teachingLanguage ?? "",
    )
      ? (row.teachingLanguage as ChatCriteria["teachingLanguage"])
      : null,
    intakeYear: row.intakeYear,
    budget: row.firstYearBudget,
    gpa: row.gpa,
    gpaScale: row.gpaScale,
    hskLevel: row.hskLevel,
    hskScore: row.hskScore,
    ielts: row.ielts,
    toefl: row.toefl,
    duolingo: row.duolingo,
    hasCsca: row.hasCsca == null ? null : Boolean(row.hasCsca),
    scholarshipType: row.scholarshipRequired ? "any" : null,
    accommodationRequired:
      row.accommodationRequired == null
        ? null
        : Boolean(row.accommodationRequired),
    province: row.preferredProvince,
    city: row.preferredCity,
  };
}

function listCustomerProfiles() {
  const rows = sqlite
    .prepare(
      `SELECT
        id,
        name,
        customer_no AS customerNo,
        target_degree AS targetDegree,
        target_major AS targetMajor,
        teaching_language AS teachingLanguage,
        intake_year AS intakeYear,
        first_year_budget AS firstYearBudget,
        gpa,
        gpa_scale AS gpaScale,
        hsk_level AS hskLevel,
        hsk_score AS hskScore,
        ielts,
        toefl,
        duolingo,
        has_csca AS hasCsca,
        scholarship_required AS scholarshipRequired,
        accommodation_required AS accommodationRequired,
        preferred_province AS preferredProvince,
        preferred_city AS preferredCity
      FROM customers
      WHERE archived = 0
      ORDER BY name
      LIMIT 500`,
    )
    .all() as CustomerProfileRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    customerNo: row.customerNo,
    criteria: criteriaFromRow(row),
  }));
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  try {
    return Response.json(
      {
        customers: listCustomerProfiles(),
        unsupportedFields,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "无法读取客户画像，请稍后重试。" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "请求来源不受信任。" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  let parsed: ReturnType<typeof profileRequestSchema.safeParse>;
  try {
    parsed = profileRequestSchema.safeParse(await request.json());
  } catch {
    return Response.json({ error: "客户画像内容无效。" }, { status: 400 });
  }
  if (!parsed.success) {
    return Response.json({ error: "客户画像内容无效。" }, { status: 400 });
  }
  const { customerId, criteria } = parsed.data;
  if (!Object.values(criteria).some((value) => value != null && value !== "")) {
    return Response.json({ error: "请先填写申请条件。" }, { status: 400 });
  }
  try {
    const customer = sqlite
      .prepare("SELECT id FROM customers WHERE id = ? AND archived = 0")
      .get(customerId);
    if (!customer) {
      return Response.json(
        { error: "客户不存在或已归档，请重新选择。" },
        { status: 400 },
      );
    }
    sqlite
      .prepare(
        `UPDATE customers SET
          target_degree = ?,
          target_major = ?,
          teaching_language = ?,
          intake_year = ?,
          first_year_budget = ?,
          gpa = ?,
          gpa_scale = ?,
          hsk_level = ?,
          hsk_score = ?,
          ielts = ?,
          toefl = ?,
          duolingo = ?,
          has_csca = ?,
          scholarship_required = ?,
          accommodation_required = ?,
          preferred_province = ?,
          preferred_city = ?,
          updated_at = ?
        WHERE id = ? AND archived = 0`,
      )
      .run(
        criteria.programType ?? null,
        criteria.targetMajor?.trim() || null,
        criteria.teachingLanguage ?? null,
        criteria.intakeYear ?? null,
        criteria.budget ?? null,
        criteria.gpa ?? null,
        criteria.gpaScale ?? null,
        criteria.hskLevel ?? null,
        criteria.hskScore ?? null,
        criteria.ielts ?? null,
        criteria.toefl ?? null,
        criteria.duolingo ?? null,
        criteria.hasCsca == null ? null : criteria.hasCsca ? 1 : 0,
        criteria.scholarshipType == null ? null : 1,
        criteria.accommodationRequired == null
          ? null
          : criteria.accommodationRequired
            ? 1
            : 0,
        criteria.province?.trim() || null,
        criteria.city?.trim() || null,
        Date.now(),
        customerId,
      );
    writeAudit(
      {
        userId: user.id,
        action: "CUSTOMER_SCREENING_PROFILE_UPDATED",
        entityType: "CUSTOMER",
        entityId: customerId,
        details: {
          fields: Object.keys(criteria).filter(
            (key) => criteria[key as keyof ChatCriteria] != null,
          ),
        },
      },
      sqlite,
    );
    return Response.json(
      { saved: true, unsupportedFields },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "客户画像未保存，请稍后重试。" },
      { status: 503 },
    );
  }
}
