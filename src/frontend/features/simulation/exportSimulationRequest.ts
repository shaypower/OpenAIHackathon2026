import type { SimulationRequest } from "@/frontend/domain/models/simulation";

export function exportSimulationRequest(request: SimulationRequest) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(request, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `simulation-context-${request.context.community.id}.mock.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
