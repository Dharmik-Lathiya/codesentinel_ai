import { describe, it, expect } from "vitest";
import { detectDeadCode } from "../src/deadcode/index.js";

describe("detectDeadCode — framework entry points", () => {
  it("does not flag Next.js App Router page/layout/route exports", () => {
    const files = [
      { path: "apps/web/app/(public)/page.tsx", content: "export default function LandingPage() { return null; }\n" },
      { path: "apps/web/app/layout.tsx", content: "export const metadata = { title: 'x' };\nexport default function RootLayout() { return null; }\n" },
      { path: "apps/web/app/api/health/route.ts", content: "export function GET() { return new Response('ok'); }\n" },
      { path: "apps/web/app/dashboard/admin/users/page.tsx", content: "export default function AdminUsersPage() { return null; }\n" },
    ];
    const findings = detectDeadCode(files);
    expect(findings).toHaveLength(0);
  });

  it("still flags real dead exports outside framework dirs", () => {
    const files = [
      { path: "src/lib/utils.ts", content: "export function neverUsed() { return 1; }\n" },
      { path: "src/lib/other.ts", content: "export function used() { return 2; }\n" },
      { path: "src/index.ts", content: "import { used } from './other';\nconsole.log(used());\n" },
    ];
    const findings = detectDeadCode(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].file).toBe("src/lib/utils.ts");
    expect(findings[0].comment).toContain("neverUsed");
  });

  it("flags dead exports inside src/app but not in entry files", () => {
    const files = [
      { path: "src/app/page.tsx", content: "export default function Home() { return null; }\n" },
      { path: "src/app/components/widget.tsx", content: "export function Widget() { return null; }\n" },
    ];
    const findings = detectDeadCode(files);
    expect(findings).toHaveLength(1);
    expect(findings[0].file).toBe("src/app/components/widget.tsx");
  });

  it("does not flag Expo app dir screens (default exports)", () => {
    const files = [
      { path: "apps/mobile/src/app/index.tsx", content: "export default function HomeScreen() { return null; }\n" },
      { path: "apps/mobile/src/app/(tabs)/bookings.tsx", content: "export default function BookingsScreen() { return null; }\n" },
    ];
    const findings = detectDeadCode(files);
    expect(findings).toHaveLength(0);
  });
});