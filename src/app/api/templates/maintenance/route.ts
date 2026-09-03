import * as XLSX from "xlsx";

import { requireRole } from "@/lib/auth";
import {
  canEditConfidentialSchoolFields,
  CONFIDENTIAL_TEMPLATE_HEADERS,
  IMPORT_ROLES,
} from "@/lib/permissions";

// 与参照表“高校项目汇总-中文(20260704).xlsx”表头对齐；
// “合作收费”为 4de647e1 补充的机密列，导入解析按表头名取值，顺序不影响。
const HEADERS = [
  "序号",
  "院校分类",
  "学校中文名",
  "学校英文名",
  "所在城市",
  "项目类型",
  "学费",
  "授课语言",
  "项目介绍",
  "学制",
  "学制备注",
  "专业列表",
  "专业方向",
  "申请要求及材料",
  "学期安排",
  "申请时间说明",
  "奖学金类别",
  "奖学金内容",
  "奖学金备注",
  "奖学金截止日期",
  "住宿费",
  "保险费",
  "自费生申请费",
  "奖学金申请费",
  "费用备注",
  "团体申请账号",
  "奖学金发放形式\noffer是否标明",
  "是否可代收",
  "截止日期",
  "公司招生名额",
  "学校招生计划",
  "招生偏向",
  "语言生是否面试、笔试",
  "学历生是否面试、笔试",
  "合作备注",
  "特殊情况备注",
  "学校申请更新频率",
  "合作收费",
];

export async function GET() {
  const user = await requireRole([...IMPORT_ROLES]);
  const canEditConfidential = canEditConfidentialSchoolFields(user.role);
  const headers = canEditConfidential
    ? HEADERS
    : HEADERS.filter((header) => !CONFIDENTIAL_TEMPLATE_HEADERS.includes(header));

  const workbook = XLSX.utils.book_new();

  // 标题行 + 表头行，空数据供填写
  const rows: (string | number)[][] = [
    ["高校项目汇总-中文版"],
    headers,
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "高校项目");

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        "attachment; filename*=UTF-8''maintenance-template.xlsx",
      "Cache-Control": "no-store",
    },
  });
}
