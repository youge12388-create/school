import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), application: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/queries", () => ({ getApplication: mocks.application }));
vi.mock("@/app/actions", () => ({ updateApplicationStatusAction: vi.fn() }));
vi.mock("@/components/ui", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  EmptyState: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PageHeading: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import ApplicationDetailPage from "./page";

beforeEach(() => {
  mocks.application.mockReset().mockResolvedValue({ application: {
    schoolName: "示例大学", customerName: "虚构客户", customerNo: "QA-1", programName: "硕士项目",
    status: "MATERIAL_PREPARATION", deadlineDate: null, requirementsText: "请上传成绩单。\n学校不招某国籍。\n请提供语言证明。",
  }, events: [] });
  mocks.user.mockReset();
});

describe("申请详情的敏感信息权限", () => {
  it("顾问看不到敏感原文，但仍能查看普通申请材料", async () => {
    mocks.user.mockResolvedValue({ role: "ADVISOR" });
    const html = renderToStaticMarkup(await ApplicationDetailPage({ params: Promise.resolve({ id: "a" }) }));
    expect(html).toContain("请上传成绩单");
    expect(html).toContain("请提供语言证明");
    expect(html).toContain("需内部核实");
    expect(html).not.toContain("某国籍");
  });
  it.each(["ADMIN", "DATA_MANAGER"])("%s 可以查看授权原文", async (role) => {
    mocks.user.mockResolvedValue({ role });
    const html = renderToStaticMarkup(await ApplicationDetailPage({ params: Promise.resolve({ id: "a" }) }));
    expect(html).toContain("某国籍");
  });
});
