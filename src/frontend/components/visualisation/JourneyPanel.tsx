import {
  ArrowLeft,
  Footprints,
  Bus,
  ArrowRightLeft,
  Clock,
  Cross,
  CircleX,
} from "lucide-react";
import type { Journey } from "@/frontend/domain/models";
import { Button } from "@/frontend/components/ui/button";
const icons = {
  walk: Footprints,
  bus: Bus,
  transfer: ArrowRightLeft,
  wait: Clock,
  service: Cross,
};
export function JourneyPanel({
  journey,
  onBack,
}: {
  journey: Journey;
  onBack: () => void;
}) {
  return (
    <section>
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft data-icon="inline-start" />
        Overview
      </Button>
      <p className="eyebrow">Resident journey / synthetic</p>
      <h3>A day shaped by one connection</h3>
      <p className="muted">{journey.residentDescription}</p>
      <ol className="journey-timeline">
        {journey.legs.map((leg) => {
          const Icon = icons[leg.mode];
          return (
            <li className={leg.status} key={leg.id}>
              <span className="journey-icon">
                <Icon size={16} />
              </span>
              <div>
                <time>{leg.startTime}</time>
                <strong>{leg.label}</strong>
                {leg.detail ? (
                  <p>{leg.detail}</p>
                ) : (
                  <small>
                    {leg.durationMinutes} min · {leg.mode}
                  </small>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="journey-failed">
        <CircleX size={18} />
        <div>
          <strong>Civic test failed</strong>
          <small>45-minute healthcare objective not met</small>
        </div>
      </div>
      <small className="muted">
        Times are local to {journey.timezone}. Illustrative journey, not routing
        output.
      </small>
    </section>
  );
}
