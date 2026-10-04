import { Database, FileCheck, ArrowLeft } from "lucide-react";
import type { Investigation } from "@/frontend/domain/models";
import { Button } from "@/frontend/components/ui/button";
export function EvidencePanel({
  investigation,
  onBack,
}: {
  investigation: Investigation;
  onBack: () => void;
}) {
  return (
    <section className="investigation">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft data-icon="inline-start" />
        Overview
      </Button>
      <p className="eyebrow">Investigation / provenance</p>
      <h3>Why the objective fails</h3>
      <p>{investigation.rootCause}</p>
      <div className="dataset-count">
        <Database size={15} />
        {investigation.queriedDatasets.length} fixture datasets inspected
      </div>
      {investigation.evidence.map((item) => (
        <article key={item.id} className="evidence-item">
          <FileCheck size={16} />
          <div>
            <p>{item.claim}</p>
            <dl>
              <dt>Source</dt>
              <dd>{item.source.name}</dd>
              <dt>Dataset</dt>
              <dd>{item.source.dataset}</dd>
              <dt>Freshness</dt>
              <dd>
                {new Date(item.source.updatedAt).toLocaleDateString("en-IE", {
                  timeZone: "Europe/Dublin",
                })}
              </dd>
              <dt>Confidence</dt>
              <dd>
                {Math.round(item.confidence * 100)}% · {item.status}
              </dd>
            </dl>
            {item.source.url ? (
              <a href={item.source.url} target="_blank" rel="noreferrer">
                View source
              </a>
            ) : (
              <small>Demonstration fixture · no public-data citation</small>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
