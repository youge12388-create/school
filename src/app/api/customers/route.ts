import { NextResponse } from "next/server";

import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { openRawDatabase } from "@/lib/db/raw";
import { asNumber, asText, newId, parseDateInput } from "@/lib/utils";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const formData = await request.formData();
    const name = asText(formData.get("name"));
    if (!name) return NextResponse.redirect(new URL("/customers/new?error=客户姓名不能为空", request.url), 303);

    const id = newId();
    const customerNo = `C${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${id.slice(0, 6).toUpperCase()}`;
    const db = openRawDatabase();
    try {
      db.prepare(`INSERT INTO customers (
        id, customer_no, name, nationality, phone, email, wechat,
        current_education, school_background, gpa, gpa_scale, hsk_level,
        hsk_score, ielts, toefl, duolingo, has_csca, target_degree,
        target_major, teaching_language, intake_year, first_year_budget,
        preferred_province, preferred_city, scholarship_required,
        accommodation_required, date_of_birth, owner_id, notes,
        next_follow_up_at, archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`).run(
        id,
        customerNo,
        name,
        asText(formData.get("nationality")) || null,
        asText(formData.get("phone")) || null,
        asText(formData.get("email")) || null,
        asText(formData.get("wechat")) || null,
        asText(formData.get("currentEducation")) || null,
        asText(formData.get("schoolBackground")) || null,
        asNumber(formData.get("gpa")),
        asNumber(formData.get("gpaScale")),
        asNumber(formData.get("hskLevel")),
        asNumber(formData.get("hskScore")),
        asNumber(formData.get("ielts")),
        asNumber(formData.get("toefl")),
        asNumber(formData.get("duolingo")),
        formData.get("hasCsca") === "yes" ? 1 : formData.get("hasCsca") === "no" ? 0 : null,
        asText(formData.get("targetDegree")) || null,
        asText(formData.get("targetMajor")) || null,
        asText(formData.get("teachingLanguage")) || null,
        asNumber(formData.get("intakeYear")),
        asNumber(formData.get("firstYearBudget")),
        asText(formData.get("preferredProvince")) || null,
        asText(formData.get("preferredCity")) || null,
        formData.get("scholarshipRequired") === "on" ? 1 : 0,
        formData.get("accommodationRequired") === "on" ? 1 : 0,
        parseDateInput(formData.get("dateOfBirth"))?.getTime() ?? null,
        user.id,
        asText(formData.get("notes")) || null,
        parseDateInput(formData.get("nextFollowUpAt"))?.getTime() ?? null,
        Date.now(),
        Date.now(),
      );
    } finally {
      db.close();
    }

    await writeAudit({
      userId: user.id,
      action: "CUSTOMER_CREATED",
      entityType: "CUSTOMER",
      entityId: id,
      details: { customerNo, name },
    });
    return NextResponse.redirect(new URL(`/customers/${id}`, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "新增客户失败";
    return NextResponse.redirect(new URL(`/customers/new?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}


