import { useState } from "react";
import { ArrowRight, LoaderCircle, Target, Square } from "lucide-react";
import { DEFAULT_OBJECTIVE } from "@/frontend/mocks/fixtures";
import { Button } from "@/frontend/components/ui/button";
import type { Phase } from "@/frontend/features/workspace/state";
import { isBusy, phaseLabel } from "@/frontend/features/workspace/state";
export function ObjectiveBar({
  phase,
  onSubmit,
  onReset,
}: {
  phase: Phase;
  onSubmit: (text: string) => void;
  onReset: () => void;
}) {
  const [text, setText] = useState(DEFAULT_OBJECTIVE);
  const [invalid, setInvalid] = useState(false);
  const busy = isBusy(phase);
  return (
    <div className="objective-dock">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim().length < 12) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          onSubmit(text);
        }}
        className="objective-form"
      >
        <label htmlFor="objective">
          <Target size={21} />
          <span>Objective</span>
        </label>
        <textarea
          id="objective"
          value={text}
          rows={2}
          maxLength={500}
          aria-invalid={invalid}
          aria-describedby="objective-help"
          disabled={busy}
          onChange={(e) => {
            setText(e.target.value);
            setInvalid(false);
          }}
        />
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? (
            <LoaderCircle data-icon="inline-start" className="spin" />
          ) : (
            <ArrowRight data-icon="inline-start" />
          )}
          {busy ? "Working…" : "Analyse objective"}
        </Button>
        {busy ? (
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label="Cancel analysis"
            onClick={onReset}
          >
            <Square />
          </Button>
        ) : null}
      </form>
      <div className="objective-status">
        <span id="objective-help" role={invalid ? "alert" : undefined}>
          {invalid
            ? "Describe the objective in at least 12 characters."
            : "Synthetic healthcare scenario · Tipperary · no live analytics"}
        </span>
        <span role="status" aria-live="polite">
          {phaseLabel(phase)}
        </span>
      </div>
    </div>
  );
}
