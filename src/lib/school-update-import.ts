import * as XLSX from "xlsx";

import { writeAudit } from "@/lib/audit";
import { openRawDatabase } from "@/lib/db/raw";
import { newId } from "@/lib/utils";

export type ParsedSchoolUpdateRow = {
  externalId: string | null;
  title: string | null;
  schoolName: string;
  publicContent: string | null;
  publicUrl: string | null;
  publicUpdatedAt: Date | null;
  publicOperator: string | null;
  secretContent: string | null;
  secretUrl: string | null;
  secretUpdatedAt: Date | null;
  secretOperator: string | null;
  submitter: string | null;
  submittedAt: Date | null;
};

function cellText(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function excelDate(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed) return null;
  return new Date(
    parsed.y,
    parsed.m - 1,
    parsed.d,
    parsed.H || 0,
    parsed.M || 0,
    parsed.S || 0,
  );
}

export function parseSchoolUpdateWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });
  const parsed: ParsedSchoolUpdateRow[] = [];
  let skipped = 0;
  for (const row of rows.slice(2)) {
    const schoolName = cellText(row[2]);
    if (!schoolName) {
      skipped += 1;
      continue;
    }
    parsed.push({
      externalId: cellText(row[0]) || null,
      title: cellText(row[1]) || null,
      schoolName,
      publicContent: cellText(row[3]) || null,
      publicUrl: cellText(row[5]) || null,
      publicUpdatedAt: excelDate(row[6]),
      publicOperator: cellText(row[7]) || null,
      secretContent: cellText(row[8]) || null,
      secretUrl: cellText(row[10]) || null,
      secretUpdatedAt: excelDate(row[11]),
      secretOperator: cellText(row[12]) || null,
      submitter: cellText(row[13]) || null,
      submittedAt: excelDate(row[14]),
    });
  }
  return { rows: parsed, skipped };
}

export function importSchoolUpdateRows(
  rows: ParsedSchoolUpdateRow[],
  actorId: string,
  database = openRawDatabase(),
) {
  const summary = {
    imported: 0,
    updated: 0,
    schoolNotFound: 0,
    skipped: 0,
  };
  for (const row of rows) {
    const school = database
      .prepare(
        "SELECT id FROM schools WHERE name_zh = ? AND archived = 0 LIMIT 1",
      )
      .get(row.schoolName) as { id: string } | undefined;
    if (!school) {
      summary.schoolNotFound += 1;
      continue;
    }
    const now = Date.now();
    const values = {
      title: row.title,
      submitter: row.submitter,
      submittedAt: row.submittedAt?.getTime() ?? null,
      publicContent: row.publicContent,
      publicUrl: row.publicUrl,
      publicOperator: row.publicOperator,
      publicUpdatedAt: row.publicUpdatedAt?.getTime() ?? null,
      secretContent: row.secretContent,
      secretUrl: row.secretUrl,
      secretOperator: row.secretOperator,
      secretUpdatedAt: row.secretUpdatedAt?.getTime() ?? null,
    };
    if (row.externalId) {
      const existing = database
        .prepare("SELECT id FROM school_updates WHERE external_id = ? LIMIT 1")
        .get(row.externalId) as { id: string } | undefined;
      if (existing) {
        database
          .prepare(
            `UPDATE school_updates SET
               school_id = ?, title = ?, submitter = ?, submitted_at = ?,
               public_content = ?, public_url = ?, public_operator = ?, public_updated_at = ?,
               secret_content = ?, secret_url = ?, secret_operator = ?, secret_updated_at = ?,
               updated_at = ?
             WHERE id = ?`,
          )
          .run(
            school.id,
            values.title,
            values.submitter,
            values.submittedAt,
            values.publicContent,
            values.publicUrl,
            values.publicOperator,
            values.publicUpdatedAt,
            values.secretContent,
            values.secretUrl,
            values.secretOperator,
            values.secretUpdatedAt,
            now,
            existing.id,
          );
        summary.updated += 1;
        continue;
      }
    }
    database
      .prepare(
        `INSERT INTO school_updates
         (id, external_id, school_id, title, submitter, submitted_at,
          public_content, public_url, public_operator, public_updated_at,
          secret_content, secret_url, secret_operator, secret_updated_at,
          archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        newId(),
        row.externalId,
        school.id,
        values.title,
        values.submitter,
        values.submittedAt,
        values.publicContent,
        values.publicUrl,
        values.publicOperator,
        values.publicUpdatedAt,
        values.secretContent,
        values.secretUrl,
        values.secretOperator,
        values.secretUpdatedAt,
        now,
        now,
      );
    summary.imported += 1;
  }
  writeAudit(
    {
      userId: actorId,
      action: "SCHOOL_UPDATES_IMPORTED",
      entityType: "SCHOOL_UPDATE",
      details: summary,
    },
    database,
  );
  return summary;
}
