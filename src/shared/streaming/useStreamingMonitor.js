import { startTransition, useEffect, useRef, useState } from 'react';

function enrichSnapshot(baseSnapshot, captureInfo) {
  if (!baseSnapshot) {
    return null;
  }
  return {
    ...baseSnapshot,
    capture: captureInfo ?? null,
  };
}

export function useStreamingMonitor({
  monitor,
  captureInfo,
  selector = (snapshot) => snapshot,
}) {
  const selectorRef = useRef(selector);
  const captureInfoRef = useRef(captureInfo);
  const [value, setValue] = useState(() =>
    selector(enrichSnapshot(monitor?.getSnapshot?.() ?? null, captureInfo)),
  );

  useEffect(() => {
    selectorRef.current = selector;
  }, [selector]);

  useEffect(() => {
    captureInfoRef.current = captureInfo;
  }, [captureInfo]);

  useEffect(() => {
    const publish = (baseSnapshot) => {
      const nextValue = selectorRef.current(
        enrichSnapshot(baseSnapshot, captureInfoRef.current),
      );
      startTransition(() => {
        setValue(nextValue);
      });
    };

    if (!monitor) {
      publish(null);
      return undefined;
    }

    publish(monitor.getSnapshot());
    return monitor.subscribe((snapshot) => {
      publish(snapshot);
    });
  }, [monitor]);

  useEffect(() => {
    const nextBaseSnapshot = monitor?.getSnapshot?.() ?? null;
    const nextValue = selectorRef.current(enrichSnapshot(nextBaseSnapshot, captureInfo));
    startTransition(() => {
      setValue(nextValue);
    });
  }, [monitor, captureInfo]);

  return value;
}
