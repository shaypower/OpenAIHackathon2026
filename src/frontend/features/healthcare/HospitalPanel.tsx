import { ArrowLeft, ArrowUpRight, BedDouble, Building2, Cross, Download, MapPin, ShieldCheck, Users, Sparkles } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import type { HospitalCapacity, HospitalPlan, HospitalSearchArea, HospitalPlacement, HospitalBenefits } from "@/frontend/domain/models/healthcare";
import { healthcareSources } from "@/frontend/adapters/data/healthcareSites";
import { capitalRange, exportHospitalPlan, HOSPITAL_CAPACITIES } from "./planning";
const number = (n: number | null | undefined) => n == null ? "Unknown" : n.toLocaleString("en-IE");

export function HospitalPanel({ areas, selectedId, plan, showProposal, placement, benefits, view, contextReady, contextError, onSelect, onCapacity, onProposal, onView, onRetryContext }: {
  areas: readonly HospitalSearchArea[]; selectedId: string | null; plan: HospitalPlan;
  showProposal: boolean; placement?: HospitalPlacement; benefits?: HospitalBenefits;
  view: "site" | "benefits"; contextReady: boolean; contextError?: string;
  onSelect: (id: string | null) => void; onCapacity: (beds: HospitalCapacity) => void;
  onProposal: (show: boolean) => void; onView: (view: "site" | "benefits") => void;
  onRetryContext: () => void;
}) {
  const selected = areas.find((area) => area.id === selectedId);
  const placed = showProposal && placement?.status === "clear" && placement.areaId === selectedId && placement.beds === plan.beds;
  const checking = placement?.status === "checking";
  const blocked = placement?.status === "blocked";
  const sources = healthcareSources.filter((source) => selected?.sourceIds.includes(source.id));
  return <aside className="context-panel hospital-panel" aria-label="Hospital planning inspector">
    <div className="panel-heading"><p className="eyebrow"><Cross size={13} /> CARE, CLOSER</p><span className="hospital-demo-badge">TIPPERARY / DEMO</span></div>
    <div className="hospital-steps" aria-label="Planning progress">
      <span className={selected ? "done" : "active"}>1 · Select area</span><span className={placed ? "done" : selected ? "active" : ""}>2 · Check site</span><span className={placed && view === "benefits" ? "active" : ""}>3 · See benefits</span>
    </div>
    {contextError ? <div role="alert" className="hospital-action-card"><p>{contextError}</p><Button variant="outline" onClick={onRetryContext}>Retry map context</Button></div> : null}
    {selected ? <>
      <Button variant="ghost" size="sm" onClick={() => onSelect(null)} className="hospital-back"><ArrowLeft size={14} /> Compare areas</Button>
      <h1>{selected.name}</h1><p className="hospital-subtitle">{selected.locality}</p>
      <nav className="hospital-area-tabs" aria-label="Hospital search areas">{areas.map((area) => <button key={area.id} aria-pressed={area.id === selectedId} onClick={() => onSelect(area.id)}>{area.name.split(" · ")[0]}</button>)}</nav>
      <p className="hospital-rationale">{selected.rationale}</p>
      <div className="hospital-action-card">
        <Button size="lg" className="w-full hospital-place" disabled={checking || !contextReady} onClick={() => onProposal(blocked || !showProposal)}>
          {placed ? <ShieldCheck size={18} /> : <Building2 size={18} />}
          {checking ? "Checking the full site…" : placed ? "Show existing context" : contextReady ? "Find a clear hospital site" : contextError ? "Map context unavailable" : "Loading building footprints…"}<ArrowUpRight size={16} />
        </Button>
        {placed ? <><p className="hospital-clear"><ShieldCheck size={15} /> No overlap with mapped buildings</p>
          <p className="hospital-assumption-note">4 ha checked against {number(placement.checkedBuildings)} building footprints, roads, water and mapped green spaces. {placement.basis === "api" ? "Confirmed by the API." : "Verified from the captured map."} Ownership and planning remain unassessed.</p>
          <Button className="w-full hospital-benefits-button" variant="outline" onClick={() => onView(view === "site" ? "benefits" : "site")}><Sparkles size={16} />{view === "site" ? "Show nearby benefits on map" : "Inspect the 3D hospital"}<ArrowUpRight size={15} /></Button></>
          : <p className={blocked ? "hospital-placement-blocked" : "hospital-assumption-note"} role="status">{blocked ? placement.reason : contextError ?? "The complete site envelope must clear mapped obstacles before any hospital appears."}</p>}
      </div>
    </> : <>
      <h1>Bring care<br />closer to home.</h1><p className="hospital-subtitle">Find a clear site. Size a hospital. See the communities around it.</p>
      <div className="hospital-shortlist">{areas.map((area, index) => <button className={`hospital-area-option hospital-option-${index}`} key={area.id} onClick={() => onSelect(area.id)}>
        <span className="hospital-area-number">0{index + 1}</span><span><strong>{area.name}</strong><small>{area.approach}</small><span>{area.locality}</span></span><ArrowUpRight size={19} />
      </button>)}</div>
      <div className="hospital-ready"><ShieldCheck size={17} /><span>{contextError ?? (contextReady ? "Building footprints captured · works offline" : "Loading mapped building context…")}</span></div>
    </>}
    {placed && benefits ? <section className="hospital-benefit-card" aria-label="Nearby population benefits">
      <p className="eyebrow"><Users size={14} /> PEOPLE NEAR THE PROPOSAL</p>
      <strong className="hospital-benefit-total">{number(benefits.residents)}<span>residents in nearby Census areas</span></strong>
      <div className="hospital-benefit-grid"><div><strong>{number(benefits.olderResidents)}</strong><span>residents aged 65+</span></div><div><strong>{number(benefits.noCarHouseholds)}</strong><span>households without a car</span></div></div>
      <p className="hospital-assumption-note">{benefits.areaCount} Census 2022 areas with centres within 3 km. Local context, not a forecast of patients or journey-time savings.</p>
    </section> : null}
    <section className="hospital-capacity" aria-label="Hospital capacity">
      <div className="hospital-section-heading"><BedDouble size={17} /><h2>New care capacity</h2><span>Proposed</span></div>
      <div role="group" aria-label="Inpatient bed capacity" className="hospital-capacity-options">{HOSPITAL_CAPACITIES.map((beds) => <button key={beds} aria-pressed={plan.beds === beds} onClick={() => onCapacity(beds)}>{beds}<span>beds</span></button>)}</div>
      <div className="hospital-programme"><span><Building2 size={15} /><strong>{number(plan.grossFloorAreaM2)} m²</strong> hospital floor area</span><span><Cross size={15} />Diagnostics + outpatient care</span></div>
      <p className="hospital-assumption-note">Two inpatient wings and a diagnostics building. 120 m² per bed across the facility. No emergency department is assumed.</p>
    </section>
    <section className="hospital-cost"><p className="eyebrow">ILLUSTRATIVE CAPITAL ALLOWANCE</p><p className="hospital-capital">{capitalRange(plan)}</p><p className="hospital-cost-caption">Includes 20–35% concept contingency</p>
      <details className="hospital-details"><summary>Cost assumptions & sources</summary><p>€1.1–1.5m per bed, plus contingency. Excludes land, off-site infrastructure, VAT, future inflation and annual operations. This is a scenario allowance, not a project budget.</p>
      {healthcareSources.filter((s) => ["uhl-cost", "bon-cost", "pbo-cost"].includes(s.id)).map((s) => <a className="hospital-source" key={s.id} href={s.url} target="_blank" rel="noreferrer">{s.title}<ArrowUpRight size={13} /></a>)}</details>
    </section>
    {selected ? <><details className="hospital-details"><summary>Why this area? Evidence & next checks</summary><p>{selected.evidence}</p><ul>{selected.constraints.map((c) => <li key={c}>{c}</li>)}</ul>{sources.map((s) => <a className="hospital-source" key={s.id} href={s.url} target="_blank" rel="noreferrer">{s.title}<ArrowUpRight size={13} /></a>)}<a className="hospital-source" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Building context © OpenStreetMap / ODbL<ArrowUpRight size={13} /></a></details>
      <Button variant="outline" className="w-full hospital-export" disabled={!placed} onClick={() => exportHospitalPlan(selected, plan, [...sources.map((s) => s.url), "https://www.openstreetmap.org/copyright"], placement, benefits)}><Download size={15} /> Export this hospital plan</Button></> : <p className="hospital-select-prompt"><MapPin size={15} />Choose an area above to start the demo.</p>}
  </aside>;
}
