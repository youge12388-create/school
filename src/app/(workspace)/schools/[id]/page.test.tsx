import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), school: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/queries", () => ({ getSchoolDetails: mocks.school }));
vi.mock("@/components/back-button", () => ({ BackButton: () => null }));
vi.mock("@/components/scroll-to-program", () => ({ ScrollToProgram: () => null }));
vi.mock("@/components/ui", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  EmptyState: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PageHeading: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import SchoolDetailsPage from "./page";

beforeEach(() => {
  mocks.school.mockReset().mockResolvedValue({
    school: { id: "s", nameZh: "示例大学", name: "示例大学", rawJson: "{}", recruitmentPreferenceText: "某类申请人更受欢迎", cooperationNote: "学校不招某国籍", reviewStatus: "AUTO_PARSED" },
    programs: [{ id: "p", name: "硕士项目", programType: "MASTER", teachingLanguage: "ENGLISH", rawJson: "{}", requirementsText: "请上传成绩单。学校限制某地区生源。", reviewStatus: "AUTO_PARSED" }],
  });
  mocks.user.mockReset();
});

describe("学校详情的敏感信息权限", () => {
  it("顾问看到核实提示，但普通材料要求仍可查看", async () => {
    mocks.user.mockResolvedValue({ role: "ADVISOR" });
    const html = renderToStaticMarkup(await SchoolDetailsPage({ params: Promise.resolve({ id: "s" }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("需人工核实");
    expect(html).toContain("请上传成绩单");
    expect(html).not.toContain("某类申请人更受欢迎");
    expect(html).not.toContain("某国籍");
    expect(html).not.toContain("某地区生源");
  });
  it.each(["ADMIN", "DATA_MANAGER"])("%s 可以查看授权原文", async (role) => {
    mocks.user.mockResolvedValue({ role });
    const html = renderToStaticMarkup(await SchoolDetailsPage({ params: Promise.resolve({ id: "s" }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("某类申请人更受欢迎");
    expect(html).toContain("某国籍");
  });
});
