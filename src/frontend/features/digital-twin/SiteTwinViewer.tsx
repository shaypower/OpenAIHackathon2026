import { useEffect, useRef, useState } from "react";
import { Box, Check, MapPin } from "lucide-react";
import type { SpatialSceneProvider } from "@/frontend/domain/contracts/providers";
import type { SiteAudit } from "@/frontend/domain/models";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/frontend/components/ui/dialog";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/frontend/components/ui/toggle-group";
function SceneCanvas({
  audit,
  provider,
  mode,
  selected,
  onSelect,
}: {
  audit: SiteAudit;
  provider: SpatialSceneProvider;
  mode: "current" | "proposed";
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<ReturnType<SpatialSceneProvider["mount"]> | null>(
    null,
  );
  useEffect(() => {
    if (!container.current) return;
    renderer.current = provider.mount(
      container.current,
      { audit, mode: "current" },
      onSelect,
    );
    return () => renderer.current?.dispose();
  }, [provider, audit, onSelect]);
  useEffect(() => {
    renderer.current?.update({ audit, mode, selectedAnnotationId: selected });
  }, [audit, mode, selected]);
  return <div ref={container} className="site-scene" />;
}
export function SiteTwinViewer({
  audit,
  provider,
  onClose,
}: {
  audit: SiteAudit;
  provider: SpatialSceneProvider;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"current" | "proposed">("current");
  const [selected, setSelected] = useState<string>();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="site-dialog"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document
            .querySelector<HTMLButtonElement>("[data-site-trigger]")
            ?.focus();
        }}
      >
        <DialogHeader>
          <p className="eyebrow">
            <Box size={14} />
            Digital Twin / integration preview
          </p>
          <DialogTitle>{audit.name}</DialogTitle>
          <DialogDescription>
            Illustrative site plan. No survey, computer vision or Gaussian splat
            has been loaded.
          </DialogDescription>
        </DialogHeader>
        <div className="site-toolbar">
          <span>
            <MapPin size={14} />
            Local site coordinates · metres
          </span>
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => {
              if (v === "current" || v === "proposed") setMode(v);
            }}
            aria-label="Site comparison"
          >
            <ToggleGroupItem value="current">Current</ToggleGroupItem>
            <ToggleGroupItem value="proposed">Proposed</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="site-layout">
          <SceneCanvas
            audit={audit}
            provider={provider}
            mode={mode}
            selected={selected}
            onSelect={setSelected}
          />
          <div className="site-observations">
            <p className="eyebrow">
              {mode === "current"
                ? "Infrastructure observations"
                : "Proposed retrofits"}
            </p>
            {mode === "current"
              ? audit.observations.map((item) => (
                  <button
                    key={item.id}
                    aria-pressed={selected === item.annotationId}
                    className={selected === item.annotationId ? "active" : ""}
                    onClick={() => setSelected(item.annotationId)}
                  >
                    <span
                      className={
                        item.category === "shelter" ? "success" : "warning"
                      }
                    >
                      {item.category === "shelter" ? (
                        <Check size={16} />
                      ) : (
                        <MapPin size={16} />
                      )}
                    </span>
                    <div>
                      <strong>{item.label}</strong>
                      <small>
                        {Math.round(item.confidence * 100)}% confidence ·
                        synthetic
                      </small>
                      <small>{item.evidence[0].source.dataset}</small>
                    </div>
                  </button>
                ))
              : audit.proposedFeatures.map((item) => (
                  <button
                    key={item.id}
                    aria-pressed={selected === item.id}
                    className={selected === item.id ? "active" : ""}
                    onClick={() => setSelected(item.id)}
                  >
                    <Check size={16} />
                    <div>
                      <strong>{item.label}</strong>
                      <small>Proposed · illustrative geometry</small>
                    </div>
                  </button>
                ))}
            <p>
              Illustrative observations and retrofit overlays. Select a finding
              to locate it in the site plan.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
