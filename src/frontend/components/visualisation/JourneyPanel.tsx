import {
  ArrowLeft,
  Footprints,
  Bus,
  ArrowRightLeft,
  Clock,
  Cross,
  CircleX,
  Play,
  Pause,
  RotateCcw,
  Route,
} from "lucide-react";
import type { Journey } from "@/frontend/domain/models";
import { Button } from "@/frontend/components/ui/button";
import type { JourneyPlayback } from "@/frontend/features/journeys/useJourneyPlayback";
import { journeyClock } from "@/frontend/features/journeys/playback";
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
  playback,
  targetMinutes,
}: {
  journey: Journey;
  onBack: () => void;
  playback: JourneyPlayback;
  targetMinutes: number;
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
      <div className="journey-outcome">
        <p className="eyebrow">
          {journey.outcome?.status === "completed"
            ? "Journey arrival"
            : "Failure / last confirmed location"}
        </p>
        <h3>{journey.outcome?.location?.label ?? "Location not provided"}</h3>
        {journey.outcome?.time ? (
          <time>{journey.outcome.time} · local time</time>
        ) : null}
        <p>
          {journey.outcome?.summary ??
            "The provider has not supplied the journey outcome location."}
        </p>
        {journey.outcome?.legId &&
        journey.legs.some((l) => l.id === journey.outcome?.legId) ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              playback.seek(
                playback.starts[
                  journey.legs.findIndex((l) => l.id === journey.outcome?.legId)
                ],
              )
            }
          >
            Jump to failure location
          </Button>
        ) : null}
      </div>
      <div className="journey-replay">
        <div>
          <p className="eyebrow">Seekable journey / synthetic</p>
          <strong>
            {journeyClock(journey.legs[0]?.startTime, playback.elapsed)}
            <small>{playback.frame?.leg.label}</small>
          </strong>
        </div>
        <div className="replay-actions">
          <Button
            variant="outline"
            size="icon"
            aria-label={
              playback.playing ? "Pause journey replay" : "Play journey replay"
            }
            disabled={playback.reduced}
            onClick={playback.toggle}
          >
            {playback.playing ? <Pause size={15} /> : <Play size={15} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Restart journey replay"
            onClick={() => playback.seek(0)}
          >
            <RotateCcw size={14} />
          </Button>
        </div>
        <input
          type="range"
          aria-label="Journey elapsed minutes"
          min={0}
          max={playback.duration}
          step={1}
          value={playback.elapsed}
          onChange={(e) => playback.seek(Number(e.target.value))}
        />
        <div className="replay-caption">
          <span>
            {Math.floor(playback.elapsed)} / {playback.duration} min
          </span>
          <span>
            {playback.reduced
              ? "Reduced motion · select a step"
              : "Compressed demo time · 12 min/s"}
          </span>
        </div>
      </div>
      <ol className="journey-timeline">
        {journey.legs.map((leg, index) => {
          const Icon = icons[leg.mode as keyof typeof icons] ?? Route;
          return (
            <li
              className={`${leg.status}${playback.frame?.index === index ? " active" : ""}`}
              key={leg.id}
            >
              <span className="journey-icon">
                <Icon size={16} />
              </span>
              <div>
                <time>{leg.startTime}</time>
                <button
                  aria-current={
                    playback.frame?.index === index ? "step" : undefined
                  }
                  className="journey-step"
                  onClick={() => playback.seek(playback.starts[index])}
                >
                  {leg.label}
                </button>
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
          <strong>
            {journey.outcome?.status === "completed"
              ? "Journey completed"
              : "Civic test failed"}
          </strong>
          <small>
            {journey.outcome?.status === "completed"
              ? "Inspect the provider result for objective evaluation."
              : `${targetMinutes}-minute civic objective not met`}
          </small>
        </div>
      </div>
      <small className="muted">
        Times are local to {journey.timezone}. Illustrative journey, not routing
        output.
      </small>
    </section>
  );
}
