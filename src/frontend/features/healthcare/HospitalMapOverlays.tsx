import { ArrowLeft, Building2, MapPin } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import type { HospitalPlan, HospitalSearchArea, HospitalPlacement } from "@/frontend/domain/models/healthcare";
import { capitalRange } from "./planning";

export function HospitalMapOverlays({ area, plan, showProposal, placement, offline, onOffline, onCompare }: {
  area?: HospitalSearchArea;
  plan: HospitalPlan;
  showProposal: boolean;
  placement?: HospitalPlacement;
  offline: boolean;
  onOffline: () => void;
  onCompare: () => void;
}) {
  const placed = showProposal && placement?.status === "clear";
  return <>
    <div className="hospital-map-toolbar">
      {area ? <Button variant="outline" onClick={onCompare}><ArrowLeft size={14} /> All areas</Button> : <div className="hospital-map-title"><MapPin size={16} /><span>Tipperary / hospital search areas</span></div>}
      <label className="hospital-offline"><input type="checkbox" checked={offline} onChange={onOffline} /> Offline map</label>
    </div>
    {area && placed ? <div className="hospital-map-readout" role="status">
      <div><Building2 size={18} /><span className="eyebrow">Proposed hospital / concept only</span></div>
      <strong>{area.name}<span>{plan.beds} beds · diagnostics</span></strong>
      <p>{capitalRange(plan)} <span>capital allowance · land not costed</span></p>
      <small>{offline ? "Previously screened map footprint · offline context" : "Envelope clear of checked map obstacles"} · land unverified</small>
    </div> : <div className="hospital-map-readout hospital-search-readout" role="status"><p className="eyebrow">{placement?.status === "checking" ? "Checking mapped obstacles" : placement?.status === "blocked" ? "Hospital not placed" : area ? "Selected search area" : "Explore the shortlist"}</p><strong>{area?.name ?? "Three places to investigate"}</strong><p>{placement?.status === "checking" ? "Finding a clear footprint near this area…" : placement?.status === "blocked" ? "Placement check incomplete · see inspector" : area ? "Place a concept from the inspector." : "Select a map label or an area in the inspector."}</p><small>Approximate locations · no confirmed land parcels</small></div>}
    <div className="map-legend hospital-legend"><span><i className="legend-service" />{placed ? "Proposed hospital" : "Hospital search area"}</span>{placed ? <span><i className="legend-failure" />Illustrative site envelope</span> : null}<span>Land & planning unverified</span></div>
  </>;
}
