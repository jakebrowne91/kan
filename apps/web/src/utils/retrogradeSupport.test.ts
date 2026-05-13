import { describe, expect, it } from "vitest";

import { parseRetrogradeSupportContext } from "./retrogradeSupport";

describe("parseRetrogradeSupportContext", () => {
  it("extracts hard parameters from Retrograde support ticket descriptions", () => {
    const context = parseRetrogradeSupportContext(`## Hard Parameters

- Event ID: event-hard-param-smoke-1778699333656
- User ID: user-hard-param-smoke
- Emma user ID: emma-hard-param-smoke
- Email: hard-param-smoke@example.com
- Issue category: outreach
- Date range: 2026-05-13 to 2026-05-13 (Europe/Dublin)
- Reported at: 2026-05-13T19:10:00.000Z
- Source channel: production_smoke
- Ari session ID: ari-session-hard-param-smoke
- Ari session URL: https://ari-gold.vercel.app/session/ari-session-hard-param-smoke
- Repo: getretrograde/agency-inbox-mgmt-backend

## Summary

Signed production smoke for hard ticket parameter rendering.`);

    expect(context?.parameters).toHaveLength(11);
    expect(context?.byKey.userId).toBe("user-hard-param-smoke");
    expect(context?.byKey.emmaUserId).toBe("emma-hard-param-smoke");
    expect(context?.byKey.email).toBe("hard-param-smoke@example.com");
    expect(context?.byKey.repoFullName).toBe(
      "getretrograde/agency-inbox-mgmt-backend",
    );
  });

  it("returns null for ordinary cards", () => {
    expect(
      parseRetrogradeSupportContext("Regular card description"),
    ).toBeNull();
  });
});
