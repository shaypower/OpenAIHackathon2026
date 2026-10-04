import { ArrowLeft, Building2, MapPin, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import type { HospitalPlan, HospitalSearchArea, HospitalPlacement, HospitalBenefits } from "@/frontend/domain/models/healthcare";
import { capitalRange } from "./planning";
export function HospitalMapOverlays({ area, plan, showProposal, placement, benefits, view, onView, offline, onOffline, onCompare }: {
  area?: HospitalSearchArea; plan: HospitalPlan; showProposal: boolean; placement?: HospitalPlacement;
  benefits?: HospitalBenefits; view: "site" | "benefits"; onView: (view: "site" | "benefits") => void;
  offline: boolean; onOffline: () => void; onCompare: () => void;
}) {
  const placed = showProposal && placement?.status === "clear";
  return <>
    <div className="hospital-map-toolbar">
      {area ? <Button variant="outline" onClick={onCompare}><ArrowLeft size={14} /> All areas</Button> : <div className="hospital-map-title"><MapPin size={16} />Tipperary / closer care</div>}
      {placed ? <div className="hospital-view-toggle"><button aria-pressed={view === "site"} onClick={() => onView("site")}><Building2 size={14} />3D site</button><button aria-pressed={view === "benefits"} onClick={() => onView("benefits")}><Users size={14} />Nearby benefits</button></div> : null}
      <label className="hospital-offline"><input type="checkbox" checked={offline} onChange={onOffline} /> Offline</label>
    </div>
    <div className="hospital-map-readout" role="status">
      {placed ? <><div><ShieldCheck size={17} /><span className="eyebrow">MAPPED FOOTPRINT CLEAR</span></div>
        <strong>{view === "benefits" ? `${benefits?.residents.toLocaleString("en-IE") ?? "—"} residents nearby` : area?.name}<span>{view === "benefits" ? "Census areas within 3 km of the proposal" : `${plan.beds} proposed beds · diagnostics + outpatient`}</span></strong>
        <p>{view === "benefits" ? `+${plan.beds} planned inpatient beds` : capitalRange(plan)}<span>{view === "benefits" ? "New care capacity to investigate for this area" : "Illustrative capital allowance"}</span></p>
        <small>{view === "benefits" ? "Distance zones · not travel-time catchments" : "4 ha screened site · ownership & planning unassessed"}</small></>
      : <><p className="eyebrow">{placement?.status === "checking" ? "CHECKING BUILDING FOOTPRINTS" : "PLAN CARE CLOSER TO HOME"}</p><strong>{area?.name ?? "Three places. One better-connected future."}</strong><p>{area ? "Find a clear site from the inspector." : "Choose an area to place a hospital concept."}</p><small>Existing buildings, roads & water retained on the map</small></>}
    </div>
    <div className="map-legend hospital-legend"><span><i style={{ background: "#0d9488" }} />{placed ? "Proposed hospital" : "Search areas"}</span>{placed && view === "benefits" ? <><span><i style={{ background: "#14b8a6" }} />Within 1 km</span><span><i style={{ background: "#8b5cf6" }} />Within 3 km</span><span>Census 2022 · area centres</span></> : <><span><i style={{ background: "#b9c7d6" }} />Existing buildings</span>{placed ? <span><i style={{ background: "#f59e0b" }} />Screened site</span> : null}</>}</div>
  </>;
}
