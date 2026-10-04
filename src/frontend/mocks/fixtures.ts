import type {
  AccessibilityResult,
  Community,
  DataSource,
  Evidence,
  Intervention,
  Journey,
  ServiceLocation,
  SiteAudit,
  StressScenario,
  TransitRoute,
  TransitStop,
} from "@/frontend/domain/models";
import type { Polygon } from "geojson";
export const DEFAULT_OBJECTIVE =
  "Make primary healthcare reachable within 45 minutes for elderly residents without cars in rural Tipperary.";
const source: DataSource = {
  id: "fixture-2026",
  name: "CIVIC demo fixtures",
  dataset: "Synthetic Tipperary scenario v1",
  updatedAt: "2026-10-04T09:00:00Z",
  mock: true,
};
export const evidence: Evidence[] = [
  {
    id: "ev-timetable",
    claim:
      "The morning feeder arrives after the connecting service has departed.",
    source: {
      ...source,
      id: "fixture-transit",
      dataset: "Synthetic timetable",
    },
    confidence: 0.96,
    status: "synthetic",
  },
  {
    id: "ev-population",
    claim:
      "Older residents without cars are disproportionately affected by the connection gap.",
    source: {
      ...source,
      id: "fixture-population",
      dataset: "Synthetic population profile",
    },
    confidence: 0.91,
    status: "synthetic",
  },
  {
    id: "ev-service",
    claim:
      "The next viable appointment cannot be reached within the objective window.",
    source: {
      ...source,
      id: "fixture-services",
      dataset: "Synthetic service availability",
    },
    confidence: 0.89,
    status: "synthetic",
  },
];
function catchment(lng: number, lat: number, scale = 1): Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [lng - 0.07 * scale, lat - 0.018 * scale],
        [lng - 0.05 * scale, lat + 0.036 * scale],
        [lng - 0.003 * scale, lat + 0.057 * scale],
        [lng + 0.071 * scale, lat + 0.025 * scale],
        [lng + 0.062 * scale, lat - 0.03 * scale],
        [lng + 0.006 * scale, lat - 0.052 * scale],
        [lng - 0.07 * scale, lat - 0.018 * scale],
      ],
    ],
  };
}
export const communities: Community[] = [
  {
    id: "borrisoleigh",
    name: "Borrisoleigh",
    regionId: "tipperary",
    center: [-7.953, 52.752],
    geometry: catchment(-7.953, 52.752),
    population: { total: 684, aged65Plus: 184, withoutCar: 132 },
    evidence,
  },
  {
    id: "roscrea",
    name: "Roscrea",
    regionId: "tipperary",
    center: [-7.799, 52.955],
    geometry: catchment(-7.799, 52.955, 1.2),
    population: { total: 1421, aged65Plus: 326, withoutCar: 238 },
    evidence,
  },
  {
    id: "newport",
    name: "Newport",
    regionId: "tipperary",
    center: [-8.41, 52.713],
    geometry: catchment(-8.41, 52.713),
    population: { total: 812, aged65Plus: 201, withoutCar: 149 },
    evidence,
  },
];
export const results: AccessibilityResult[] = communities.map((c, i) => ({
  communityId: c.id,
  accessPercent: [57, 63, 71][i],
  targetPercent: 90,
  travelMinutes: [69, 82, 61][i],
  affectedResidents: [294, 526, 235][i],
  status: "fail",
  mock: true,
  reason: {
    id: `reason-${c.id}`,
    title: [
      "A connection missed by 24 minutes",
      "A long gap in the morning network",
      "The last kilometre has no safe connection",
    ][i],
    description: [
      "The feeder reaches the interchange after the only viable morning connection. The next service leaves at 10:42.",
      "A single morning service leaves too early for the local feeder. Residents face a 46-minute wait.",
      "The nearest stop is outside the walkable catchment for residents with reduced mobility.",
    ][i],
    severity: i === 2 ? "medium" : "high",
    evidence,
  },
}));
export const services: ServiceLocation[] = [
  {
    id: "thurles-gp",
    name: "Thurles primary care · demo",
    kind: "healthcare",
    geometry: { type: "Point", coordinates: [-7.813, 52.68] },
    evidence,
  },
  {
    id: "nenagh-gp",
    name: "Nenagh primary care · demo",
    kind: "healthcare",
    geometry: { type: "Point", coordinates: [-8.195, 52.865] },
    evidence,
  },
  {
    id: "roscrea-gp",
    name: "Roscrea primary care · demo",
    kind: "healthcare",
    geometry: { type: "Point", coordinates: [-7.791, 52.951] },
    evidence,
  },
];
export const stops: TransitStop[] = communities.map((c) => ({
  id: `stop-${c.id}`,
  name: `${c.name} interchange · demo`,
  geometry: { type: "Point", coordinates: c.center },
}));
export const routes: TransitRoute[] = [
  {
    id: "feeder",
    name: "Morning feeder · synthetic",
    geometry: {
      type: "LineString",
      coordinates: [
        [-8.195, 52.865],
        [-8.083, 52.808],
        [-7.953, 52.752],
        [-7.887, 52.721],
        [-7.813, 52.68],
      ],
    },
    stopIds: ["stop-borrisoleigh"],
    status: "existing",
  },
  {
    id: "north-link",
    name: "North county connection · synthetic",
    geometry: {
      type: "LineString",
      coordinates: [
        [-7.799, 52.955],
        [-7.827, 52.898],
        [-7.811, 52.793],
        [-7.813, 52.68],
      ],
    },
    stopIds: ["stop-roscrea"],
    status: "existing",
  },
];
export function journeyFor(communityId: string): Journey {
  const c = communities.find((c) => c.id === communityId)!;
  return {
    id: `journey-${communityId}`,
    communityId,
    residentDescription: "Representative resident · age 74 · no car",
    timezone: "Europe/Dublin",
    mock: true,
    legs: [
      {
        id: "home",
        mode: "walk",
        label: "Leave home",
        startTime: "07:18",
        endTime: "07:31",
        durationMinutes: 13,
        status: "completed",
        geometry: {
          type: "LineString",
          coordinates: [[c.center[0] - 0.02, c.center[1] + 0.012], c.center],
        },
      },
      {
        id: "stop",
        mode: "wait",
        label: "Reach local stop",
        startTime: "07:31",
        endTime: "07:39",
        durationMinutes: 8,
        status: "completed",
      },
      {
        id: "bus",
        mode: "bus",
        label: "Morning feeder",
        startTime: "07:39",
        endTime: "08:17",
        durationMinutes: 38,
        status: "completed",
        geometry: {
          type: "LineString",
          coordinates: [c.center, [-7.86, 52.714], [-7.813, 52.68]],
        },
      },
      {
        id: "transfer",
        mode: "transfer",
        label: "Missed connection",
        startTime: "08:17",
        endTime: "10:42",
        durationMinutes: 145,
        status: "failed",
        detail:
          "Connection departed 07:53 · missed by 24 min. Next service 10:42.",
      },
      {
        id: "gp",
        mode: "service",
        label: "Primary healthcare",
        startTime: "10:42",
        endTime: "11:03",
        durationMinutes: 21,
        status: "unavailable",
        detail: "The 45-minute civic objective is not met.",
      },
    ],
  };
}
export function interventionsFor(communityId: string): Intervention[] {
  const c = communities.find((c) => c.id === communityId)!;
  return [
    {
      name: "Shift the morning departure",
      description:
        "Move the connecting departure by 24 minutes to align with the feeder.",
      kind: "schedule" as const,
      access: 73,
      cost: 80,
      helped: 97,
      resilience: 62,
      equity: 74,
    },
    {
      name: "Add a morning feeder",
      description:
        "One direct accessible service connects the catchment to primary care.",
      kind: "service" as const,
      access: 88,
      cost: 620,
      helped: 188,
      resilience: 78,
      equity: 86,
    },
    {
      name: "Feeder + mobile clinic",
      description:
        "Combine a direct morning connection with a weekly clinic at the local stop.",
      kind: "combined" as const,
      access: 94,
      cost: 980,
      helped: 231,
      resilience: 89,
      equity: 95,
    },
  ].map((v, i) => ({
    id: `${communityId}-patch-${i}`,
    communityId,
    name: v.name,
    description: v.description,
    kind: v.kind,
    impact: {
      accessPercent: v.access,
      residentsHelped: v.helped,
      operatingCostWeekly: v.cost,
      resiliencePercent: v.resilience,
      equityPercent: v.equity,
    },
    metrics: [
      { name: "Access", value: v.access, unit: "%" },
      { name: "Operating impact", value: v.cost, unit: "EUR/week" },
    ],
    features:
      i === 0
        ? []
        : [
            {
              id: `route-${communityId}`,
              label: "Proposed accessible feeder",
              kind: "route",
              geometry: {
                type: "LineString",
                coordinates: [
                  c.center,
                  [c.center[0] + 0.032, c.center[1] - 0.013],
                  [-7.878, 52.719],
                  [-7.813, 52.68],
                ],
              },
            },
            ...(i === 2
              ? [
                  {
                    id: `clinic-${communityId}`,
                    label: "Proposed mobile clinic",
                    kind: "facility" as const,
                    geometry: {
                      type: "Point" as const,
                      coordinates: [c.center[0] + 0.018, c.center[1] - 0.008],
                    },
                  },
                ]
              : []),
          ],
    evidence,
    mock: true,
  }));
}
export const scenarios: StressScenario[] = [
  {
    id: "flood",
    name: "Flood event",
    kind: "flood",
    description:
      "A low-lying section becomes impassable. The direct feeder cannot complete its planned route.",
    features: [
      {
        id: "flood-zone",
        label: "Synthetic flood extent",
        kind: "coverage",
        geometry: catchment(-7.875, 52.719, 0.38),
      },
    ],
    lossPercentPoints: 26,
    affectedResidents: 1421,
  },
  {
    id: "road",
    name: "Road closure",
    kind: "road-closure",
    description:
      "A section of the connecting road is closed for emergency works.",
    features: [
      {
        id: "road-block",
        label: "Closed road section",
        kind: "route",
        geometry: {
          type: "LineString",
          coordinates: [
            [-7.892, 52.728],
            [-7.858, 52.701],
          ],
        },
      },
    ],
    lossPercentPoints: 19,
    affectedResidents: 842,
  },
  {
    id: "gp",
    name: "GP closure",
    kind: "gp-closure",
    description:
      "The primary care service is unavailable. A backup facility is needed.",
    features: [
      {
        id: "closed-gp",
        label: "GP temporarily closed",
        kind: "facility",
        geometry: services[0].geometry,
      },
    ],
    lossPercentPoints: 33,
    affectedResidents: 1690,
  },
  {
    id: "bus",
    name: "Service cancellation",
    kind: "cancellation",
    description:
      "The morning feeder is cancelled. A replacement connection is required.",
    features: [
      {
        id: "cancelled",
        label: "Cancelled feeder",
        kind: "route",
        geometry: routes[0].geometry,
      },
    ],
    lossPercentPoints: 22,
    affectedResidents: 1096,
  },
];
export function siteFor(communityId: string): SiteAudit {
  const c = communities.find((c) => c.id === communityId)!;
  const labels = [
    "No dropped kerb",
    "No continuous pavement",
    "Unsafe crossing",
    "No seating",
    "Shelter present",
  ];
  return {
    id: `site-${communityId}`,
    name: `${c.name} interchange`,
    communityId,
    mock: true,
    asset: {
      id: "schematic-stop",
      format: "schematic",
      coordinateSystem: "local-metres",
      origin: c.center,
      camera: { position: [12, 10, 16], target: [0, 0, 0] },
    },
    annotations: labels.map((label, i) => ({
      id: `annotation-${i}`,
      label,
      position: [i * 3 - 6, 0, i % 2 ? 3 : -3],
      kind: i === 4 ? "existing" : "issue",
    })),
    observations: labels.map((label, i) => ({
      id: `observation-${i}`,
      label,
      category: (
        ["kerb", "pavement", "crossing", "seating", "shelter"] as const
      )[i],
      confidence: [0.93, 0.9, 0.86, 0.95, 0.98][i],
      annotationId: `annotation-${i}`,
      evidence: [evidence[2]],
    })),
    proposedFeatures: [
      {
        id: "retrofit-kerb",
        label: "Dropped kerb",
        position: [-6, 0, -3],
        kind: "proposed",
      },
      {
        id: "retrofit-pavement",
        label: "Continuous pavement",
        position: [-3, 0, 3],
        kind: "proposed",
      },
      {
        id: "retrofit-crossing",
        label: "Raised crossing",
        position: [0, 0, -3],
        kind: "proposed",
      },
      {
        id: "retrofit-seating",
        label: "Accessible seating",
        position: [3, 0, 3],
        kind: "proposed",
      },
    ],
  };
}
