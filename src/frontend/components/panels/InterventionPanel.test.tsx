import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InterventionPanel } from "./InterventionPanel";
import { initialState } from "@/frontend/features/workspace/state";
import type { Intervention } from "@/frontend/domain/models";
const proposal: Intervention = {
  id: "unscored",
  communityId: "borrisoleigh",
  name: "Timetable proposal",
  description: "Awaiting deterministic evaluation",
  kind: "schedule",
  metrics: [],
  features: [],
  evidence: [],
  mock: false,
};
describe("unscored proposal presentation", () => {
  it("does not invent impact, cost or resilience when a backend proposal has not been evaluated", () => {
    const html = renderToStaticMarkup(
      <InterventionPanel
        workspace={{
          state: {
            ...initialState,
            candidates: [proposal],
            intervention: proposal,
            phase: { kind: "intervention-selected" },
          },
          preview: vi.fn(),
          apply: vi.fn(),
        }}
      />,
    );
    expect(html).toContain("Unscored");
    expect(html).toContain("cost and impact unknown");
    expect(html).toContain("Not evaluated");
    expect(html).toContain("Apply &amp; simulate");
    expect(html).not.toContain("94%");
    expect(html).not.toContain("€0");
    expect(html).not.toContain("Most resilient option");
  });
});
