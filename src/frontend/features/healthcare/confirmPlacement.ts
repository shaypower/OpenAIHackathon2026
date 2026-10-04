import type { HospitalPlacement } from "@/frontend/domain/models/healthcare";

type ClearPlacement = Extract<HospitalPlacement, { status: "clear" }>;

/** Offline fallback is explicit; a contradictory success is never accepted. */
export async function confirmHospitalPlacement(
  local: ClearPlacement,
  fetcher: typeof fetch = fetch,
): Promise<HospitalPlacement> {
  const blocked = (): HospitalPlacement => ({
    status: "blocked", areaId: local.areaId, beds: local.beds,
    reason: "The server and captured map do not agree on this site. Reload the map context before placing the hospital.",
  });
  let response: Response;
  try {
    response = await fetcher("/api/hospitals/preview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ area_id: local.areaId, beds: local.beds, context_id: local.snapshotId }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    return local;
  }
  // An absent endpoint or unavailable service leaves the independently checked
  // snapshot usable. An explicit refusal or malformed success blocks placement.
  if (response.status === 404 || response.status >= 500) return local;
  if (!response.ok) return blocked();
  try {
    const value = await response.json();
    const remote = value?.data?.placement;
    if (value?.schema_version !== 1 || remote?.status !== "clear"
      || remote.snapshotId !== local.snapshotId || remote.areaId !== local.areaId
      || remote.beds !== local.beds || remote.checkedBuildings !== local.checkedBuildings
      || remote.checkedObstacles !== local.checkedObstacles
      || remote.checkedAt !== local.checkedAt
      || JSON.stringify(remote.center) !== JSON.stringify(local.center)) return blocked();
    return { ...local, basis: "api" };
  } catch {
    return blocked();
  }
}
