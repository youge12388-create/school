import { describe, expect, it } from "vitest";

import type { UserRole } from "@/lib/constants";
import {
  serializeSchoolUpdate,
  stripSchoolUpdateInput,
  type SchoolUpdateAttachment,
  type SchoolUpdateRow,
} from "@/lib/school-updates";

const row: SchoolUpdateRow = {
  id: "u1",
  externalId: null,
  schoolId: "s1",
  title: "更新标题",
  submitter: "提交人甲",
  submittedAt: 1,
  publicContent: "普通更新内容",
  publicUrl: "https://example.com/public",
  publicOperator: "普通操作人",
  publicUpdatedAt: 2,
  secretContent: "机密更新内容",
  secretUrl: "https://example.com/secret",
  secretOperator: "机密操作人",
  secretUpdatedAt: 3,
  createdAt: 4,
  updatedAt: 5,
};

const attachments: SchoolUpdateAttachment[] = [
  {
    id: "a1",
    schoolUpdateId: "u1",
    groupName: "PUBLIC",
    originalName: "public.png",
    mimeType: "image/png",
    size: 10,
    createdAt: 1,
  },
  {
    id: "a2",
    schoolUpdateId: "u1",
    groupName: "SECRET",
    originalName: "secret.png",
    mimeType: "image/png",
    size: 20,
    createdAt: 2,
  },
];

describe("school update field permissions", () => {
  for (const role of ["ADMIN", "DATA_MANAGER"] as UserRole[]) {
    it(`keeps secret and personnel fields for ${role}`, () => {
      const view = serializeSchoolUpdate(row, attachments, role);
      expect(view.secretContent).toBe("机密更新内容");
      expect(view.submitter).toBe("提交人甲");
      expect(view.publicOperator).toBe("普通操作人");
      expect(view.attachments.map((item) => item.id)).toEqual(["a1", "a2"]);
    });
  }

  for (const role of ["ADVISOR", "MARKET_MANAGER", "CHANNEL_RESOURCE"] as UserRole[]) {
    it(`strips secret and personnel fields for ${role}`, () => {
      const view = serializeSchoolUpdate(row, attachments, role);
      expect(view.secretContent).toBeUndefined();
      expect(view.secretOperator).toBeUndefined();
      expect(view.submitter).toBeUndefined();
      expect(view.publicOperator).toBeUndefined();
      expect(view.publicContent).toBe("普通更新内容");
      expect(view.attachments.map((item) => item.id)).toEqual(["a1"]);
    });
  }

  it("defensively strips secret keys from non-manager input", () => {
    const input = {
      publicContent: "普通",
      secretContent: "机密",
      submitter: "提交人",
      publicOperator: "操作人",
    };
    const output = stripSchoolUpdateInput(input, "ADVISOR");
    expect(output.publicContent).toBe("普通");
    expect(output.secretContent).toBeUndefined();
    expect(output.submitter).toBeUndefined();
    expect(output.publicOperator).toBeUndefined();
  });
});
