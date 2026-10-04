import type { HospitalSearchArea, PlanningSource } from "@/frontend/domain/models/healthcare";

const checkedOn = "2026-10-04";
export const healthcareSources: readonly PlanningSource[] = [
  {
    id: "nenagh-hse", publisher: "HSE", checkedOn,
    title: "Nenagh Hospital directory",
    url: "https://www2.hse.ie/services/hospitals/nenagh-hospital/",
    finding: "Confirms the existing hospital at Tyone and describes bus connections and nearby rail access. It does not establish land availability for expansion.",
  },
  {
    id: "nenagh-plan", publisher: "Tipperary County Council", checkedOn,
    title: "Nenagh Local Area Plan 2024–2030",
    url: "https://www.tipperarycoco.ie/planning-and-building/local-area-plan-consultation/nenagh-and-environs-local-area-plan-2024-2030",
    finding: "The written statement identifies Tyone's existing hospital and healthcare cluster (§5.2.1 / §5.6). Its zoning, heritage and flood maps are the next screening inputs.",
  },
  {
    id: "thurles-plan", publisher: "Tipperary County Council", checkedOn,
    title: "Thurles Local Area Plan 2024–2030",
    url: "https://www.tipperarycoco.ie/planning-and-building/local-area-plan-consultation/thurles-and-environs-local-area-plan-2024-2030",
    finding: "Provides town transport, serviced-land, zoning and flood-risk material. Community Services and Infrastructure zoning includes healthcare; a public health centre classification does not approve an inpatient hospital.",
  },
  {
    id: "roscrea-plan", publisher: "Tipperary County Council", checkedOn,
    title: "Roscrea Local Area Plan 2023–2029",
    url: "https://www.tipperarycoco.ie/planning-and-building/local-area-plan-consultation/roscrea-local-area-plan-2023-2029",
    finding: "Provides zoning and environmental maps. The written statement notes flood constraints at the edge of station lands; that area should not be treated as a cleared hospital site.",
  },
  {
    id: "uhl-cost", publisher: "HSE", checkedOn,
    title: "UHL 96-bed ward block · €105m · 2025",
    url: "https://about.hse.ie/news/minister-for-health-officially-opens-96-bed-block-at-uhl/",
    finding: "Published cost for a 6,700 m² inpatient ward block on an existing hospital campus. This is an expansion benchmark, not the price of a standalone hospital.",
  },
  {
    id: "bon-cost", publisher: "Bon Secours Health System", checkedOn,
    title: "New Limerick hospital · €213m · 2026 opening",
    url: "https://www.bonsecours.ie/about/news/minister-patrick-odonovan-officially-opens-bon-secours-limerick-hospital",
    finding: "The opening announcement reports €213m for a new hospital with multiple specialties and advanced diagnostic imaging. Its scope differs from this small-hospital concept.",
  },
  {
    id: "pbo-cost", publisher: "Oireachtas Parliamentary Budget Office", checkedOn,
    title: "Hospital Construction Costs · January 2025",
    url: "https://data.oireachtas.ie/ie/oireachtas/parliamentaryBudgetOffice/2025/2025-01-30_hospital-construction-costs_en.pdf",
    finding: "Explains why per-bed comparisons vary with acuity, equipment, VAT, scope and inflation. A capacity-based allowance needs project-specific quantity surveying before investment decisions.",
  },
];

/** Editorial search areas from the cited plans, not a scored suitability model. */
export const hospitalSearchAreas: readonly HospitalSearchArea[] = [
  {
    id: "nenagh-tyone", name: "Nenagh · Tyone", locality: "Existing healthcare cluster",
    approach: "Investigate campus expansion", center: [-8.1951, 52.8577],
    rationale: "Start with the existing healthcare cluster. An inpatient and diagnostics extension could share clinical pathways with Nenagh Hospital, subject to an HSE service and estate assessment.",
    evidence: "Existing hospital and nearby healthcare uses are documented by the HSE and the adopted local plan. This is the strongest existing-campus context in this shortlist, not a proven best site.",
    constraints: ["Confirm available land and HSE estate capacity; adjacent healthcare developments already occupy land.", "Check parcel zoning, flood risk and heritage; no property boundary has been assessed.", "Test a net-new clinical need, staffing and diagnostics capacity rather than duplicate existing services."],
    sourceIds: ["nenagh-hse", "nenagh-plan"],
  },
  {
    id: "thurles-west", name: "Thurles · west", locality: "Western town / rail-side search area",
    approach: "Investigate a new hospital", center: [-7.827, 52.678],
    rationale: "Explore a small hospital serving central Tipperary, with rail and town access considered from the start. Search for a suitably zoned serviced parcel within the town rather than assume greenfield land is available.",
    evidence: "The adopted town plan provides transport and serviced-land screening material. This approximate western search anchor is an editorial hypothesis; it is not a council-designated hospital site.",
    constraints: ["Identify a contiguous parcel and confirm hospital use with the planning authority.", "Assess flood risk, drainage, utilities and road access against the adopted maps.", "Model public-transport journeys and clinical catchment demand; town proximity alone does not demonstrate access."],
    sourceIds: ["thurles-plan"],
  },
  {
    id: "roscrea", name: "Roscrea", locality: "Northern Tipperary search area",
    approach: "Investigate a new hospital", center: [-7.797, 52.957],
    rationale: "Explore a northern service location as an alternative to Nenagh and Thurles. Compare a local inpatient and diagnostics service with improved transport to existing hospitals before committing to new construction.",
    evidence: "The adopted plan supplies zoning and environmental screening. The search anchor is approximate; nearby station-edge flood constraints make parcel-level screening essential.",
    constraints: ["Screen flood-risk maps first, including constraints near station lands.", "Confirm land ownership, availability and an inpatient-hospital planning classification.", "Establish the cross-county clinical catchment, referral pathways and workforce before selecting capacity."],
    sourceIds: ["roscrea-plan"],
  },
];
