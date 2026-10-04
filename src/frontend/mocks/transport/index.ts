import fixture from "./network.json";
import { parseTransportNetwork } from "@/frontend/adapters/data/transportNetwork";
import { routePath } from "@/frontend/features/transport/topology";

// This locally generated, versioned asset is validated by topology tests.
export const transportNetwork = parseTransportNetwork(fixture);
const communityPaths = {
  borrisoleigh: {
    routeId: "demo-feeder",
    from: "demo-borrisoleigh",
    to: "843000001",
  },
  roscrea: { routeId: "tfi-854", from: "8420B155531", to: "8420B2019401" },
  newport: { routeId: "tfi-391", from: "8420B3360901", to: "843000001" },
};
export function communityPath(id: string, contingency = false) {
  const spec = communityPaths[id as keyof typeof communityPaths];
  if (!spec) throw new Error("No captured transport path for this community.");
  return routePath(
    transportNetwork,
    contingency && id === "borrisoleigh" ? "demo-contingency" : spec.routeId,
    spec.from,
    spec.to,
  );
}
