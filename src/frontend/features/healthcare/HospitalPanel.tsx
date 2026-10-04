import { ArrowLeft, ArrowUpRight, BedDouble, Building2, Cross, Download, MapPin, ScanLine } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { useRef } from "react";
import type { HospitalCapacity, HospitalPlan, HospitalSearchArea, HospitalPlacement } from "@/frontend/domain/models/healthcare";
import { healthcareSources } from "@/frontend/adapters/data/healthcareSites";
import { capitalRange, euroMillions, exportHospitalPlan, HOSPITAL_CAPACITIES } from "./planning";

export function HospitalPanel({ areas, selectedId, plan, showProposal, placement, onSelect, onCapacity, onProposal }: {
  areas: readonly HospitalSearchArea[];
  selectedId: string | null;
  plan: HospitalPlan;
  showProposal: boolean;
  placement?: HospitalPlacement;
  onSelect: (id: string | null) => void;
  onCapacity: (beds: HospitalCapacity) => void;
  onProposal: (show: boolean) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const selected = areas.find((area) => area.id === selectedId);
  const placed = showProposal && placement?.status === "clear";
  const checking = placement?.status === "checking";
  const blocked = placement?.status === "blocked";
  const sources = healthcareSources.filter((source) => selected?.sourceIds.includes(source.id));
  const costSources = healthcareSources.filter((source) => ["uhl-cost", "bon-cost", "pbo-cost"].includes(source.id));
  return (
    <aside ref={panel} className="context-panel hospital-panel" aria-label="Hospital planning inspector" key={selectedId ?? "shortlist"}>
      <div className="panel-heading"><p className="eyebrow"><Cross size={13} /> Healthcare planning</p><span className="micro">TIPPERARY</span></div>
      {selected ? <>
        <Button variant="ghost" size="sm" onClick={() => onSelect(null)} className="hospital-back"><ArrowLeft size={14} /> Compare areas</Button>
        <h1>{selected.name}</h1>
        <p className="hospital-subtitle">{selected.locality}</p>
        <nav className="hospital-area-tabs" aria-label="Hospital search areas">
          {areas.map((area) => <button key={area.id} aria-pressed={area.id === selectedId} onClick={() => onSelect(area.id)}>{area.name.split(" · ")[0]}</button>)}
        </nav>
        <p className="hospital-rationale">{selected.rationale}</p>
        <div className="hospital-land-status"><MapPin size={15} /><span>Search area · land availability unverified</span></div>
      </> : <>
        <h1>Where should<br />care go next?</h1>
        <p className="hospital-subtitle">Explore a small hospital with inpatient beds, diagnostics and outpatient care.</p>
        <p className="hospital-shortlist-note">Three areas to investigate. No site is confirmed buildable; this shortlist is not a demand-based ranking.</p>
        <div className="hospital-shortlist">
          {areas.map((area, index) => <button className="hospital-area-option" key={area.id} onClick={() => onSelect(area.id)}>
            <span className="hospital-area-number">0{index + 1}</span>
            <span><strong>{area.name}</strong><small>{area.approach}</small><span>{area.locality}</span></span>
            <ArrowUpRight size={17} />
          </button>)}
        </div>
      </>}
      <section className="hospital-capacity" aria-label="Hospital capacity">
        <div className="hospital-section-heading"><BedDouble size={16} /><h2>Size the hospital</h2><span>Concept assumption</span></div>
        <div role="group" aria-label="Inpatient bed capacity" className="hospital-capacity-options">
          {HOSPITAL_CAPACITIES.map((beds) => <button key={beds} aria-pressed={plan.beds === beds} onClick={() => onCapacity(beds)}>{beds}<span>beds</span></button>)}
        </div>
        <div className="hospital-programme"><span><Building2 size={14} /><strong>{plan.grossFloorAreaM2.toLocaleString("en-IE")} m²</strong> gross floor area</span><span><ScanLine size={14} />Diagnostics + outpatient</span></div>
        <p className="hospital-assumption-note">120 m² per bed across the whole facility; 4 ha illustrative site. Assumed massing, not a surveyed land requirement. Emergency department not included.</p>
      </section>
      <section className="hospital-cost" aria-label="Indicative hospital cost">
        <p className="eyebrow">Early capital allowance</p>
        <p className="hospital-capital" aria-live="polite">{capitalRange(plan)}</p>
        <p className="hospital-cost-caption">Illustrative estimate · includes concept contingency</p>
        <dl className="hospital-cost-breakdown">
          <div><dt>Base capital allowance</dt><dd>{euroMillions(plan.baseCapitalEur[0])}–{euroMillions(plan.baseCapitalEur[1]).replace("€", "")}</dd></div>
          <div><dt>Contingency · 20–35%</dt><dd>{euroMillions(plan.contingencyEur[0])}–{euroMillions(plan.contingencyEur[1]).replace("€", "")}</dd></div>
          <div><dt>Land + off-site works</dt><dd>Not costed</dd></div>
          <div><dt>Annual running costs</dt><dd>Not costed</dd></div>
        </dl>
        <p className="hospital-assumption-note">Assumed €1.1–1.5m per bed, informed by Irish project context but not a fitted benchmark rate or quantity survey. Excludes land, off-site infrastructure, VAT, future inflation and annual operations. The same allowance applies to each area; local cost differences are unknown.</p>
      </section>
      {selected ? <>
        <Button size="lg" className="w-full hospital-place" disabled={checking} onClick={() => { onProposal(blocked || !showProposal); panel.current?.scrollTo({ top: 0, behavior: "instant" }); }}><Building2 size={16} />{checking ? "Checking mapped footprints…" : placed ? "Show existing context" : blocked ? "Retry placement check" : "Place hospital concept"}<ArrowUpRight size={15} /></Button>
        <p className={`hospital-proposal-note${blocked ? " hospital-placement-blocked" : ""}`} role="status">{checking ? "Searching within 400 m for a site envelope clear of mapped buildings, transport, water and mapped parks/woodland. No hospital is placed until screening completes." : blocked ? placement.reason : placed ? `${plan.beds}-bed concept on map. Full 4 ha envelope screened against ${placement.checkedBuildings} loaded building features and mapped obstacles. Map clearance only; ownership, planning and unmapped obstacles remain unverified.` : "Choose ‘Place hospital concept’ to check existing footprints before showing a labelled 3D massing."}</p>
        <details className="hospital-details" open>
          <summary>Why investigate this area?</summary>
          <p>{selected.evidence}</p>
          {sources.map((source) => <a className="hospital-source" key={source.id} href={source.url} target="_blank" rel="noreferrer"><span>{source.title}<small>{source.publisher} · checked 4 Oct 2026</small></span><ArrowUpRight size={13} /></a>)}
        </details>
        <details className="hospital-details">
          <summary>What needs to be verified?</summary>
          <ul>{selected.constraints.map((constraint) => <li key={constraint}>{constraint}</li>)}</ul>
          <p>Buildability and a clinical business case remain unconfirmed. Travel-time and population benefits have not been calculated.</p>
        </details>
      </> : <p className="hospital-select-prompt"><MapPin size={15} /> Select an area to inspect the evidence and place a hospital concept.</p>}
      <details className="hospital-details">
        <summary>Cost evidence & methodology</summary>
        <p>Published projects have different scopes and price years. The allowance is a transparent scenario input, not an HSE budget or a quote. Capacity scaling is approximate and does not capture fixed clinical costs.</p>
        {costSources.map((source) => <div key={source.id} className="hospital-benchmark"><a className="hospital-source" href={source.url} target="_blank" rel="noreferrer"><span>{source.title}<small>{source.publisher} · checked 4 Oct 2026</small></span><ArrowUpRight size={13} /></a><p>{source.finding}</p></div>)}
      </details>
      {selected ? <Button size="sm" variant="ghost" className="hospital-export w-full" onClick={() => exportHospitalPlan(selected, plan, [...sources, ...costSources].map((source) => source.url), placement)}><Download size={14} /> Export hospital concept · JSON</Button> : null}
    </aside>
  );
}
