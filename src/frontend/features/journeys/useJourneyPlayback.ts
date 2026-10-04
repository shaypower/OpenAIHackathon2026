import { useEffect, useMemo, useState } from "react";
import type { Journey } from "@/frontend/domain/models";
import { elapsedAt, prepareJourney, type PlaybackClock } from "./playback";

export function useJourneyPlayback(
  journey: Journey | undefined,
  enabled: boolean,
) {
  const prepared = useMemo(
    () => (journey ? prepareJourney(journey) : undefined),
    [journey],
  );
  const duration = prepared?.duration ?? 0;
  const initial = useMemo<PlaybackClock>(
    () => ({
      journeyId: journey?.id ?? "",
      elapsedMinutes: 0,
      startedAt: null,
      speed: 12,
    }),
    [journey?.id],
  );
  const [stored, setStored] = useState<PlaybackClock>(initial);
  const [now, setNow] = useState(() => performance.now());
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const clock = stored.journeyId === journey?.id ? stored : initial;
  const playing = enabled && clock.startedAt !== null && !reduced;
  const effective = useMemo(
    () => (enabled ? clock : { ...clock, startedAt: null }),
    [clock, enabled],
  );
  useEffect(() => {
    const pause = () =>
      setStored((current) =>
        current.startedAt === null
          ? current
          : {
              ...current,
              elapsedMinutes: elapsedAt(current, duration),
              startedAt: null,
            },
      );
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const motionChanged = () => {
      setReduced(media.matches);
      if (media.matches) pause();
    };
    const visibility = () => {
      if (document.hidden) pause();
    };
    media.addEventListener("change", motionChanged);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      media.removeEventListener("change", motionChanged);
      document.removeEventListener("visibilitychange", visibility);
      pause();
    };
  }, [enabled, journey?.id, duration]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const time = performance.now();
      setNow(time);
      if (elapsedAt(clock, duration, time) >= duration)
        setStored((current) => ({
          ...current,
          elapsedMinutes: duration,
          startedAt: null,
        }));
    }, 150);
    return () => clearInterval(timer);
  }, [playing, clock, duration]);
  const elapsed = playing
    ? elapsedAt(effective, duration, now)
    : effective.elapsedMinutes;
  return {
    clock: effective,
    duration,
    elapsed,
    frame: prepared?.frame(elapsed),
    starts: prepared?.starts ?? [],
    playing,
    reduced,
    seek(minutes: number) {
      setStored({
        ...initial,
        elapsedMinutes: Math.min(duration, Math.max(0, minutes)),
      });
    },
    toggle() {
      if (!enabled || reduced) return;
      const time = performance.now();
      setNow(time);
      const elapsedMinutes = elapsedAt(clock, duration, time);
      setStored({
        ...clock,
        elapsedMinutes: elapsedMinutes >= duration ? 0 : elapsedMinutes,
        startedAt: playing ? null : time,
      });
    },
  };
}
export type JourneyPlayback = ReturnType<typeof useJourneyPlayback>;
