import { useStreamingCaptureController } from './useStreamingCaptureController.js';
import { useStreamingMonitor } from './useStreamingMonitor.js';

export function useStreamingMicrophone({
  modelId,
  isRealtimeEouModel,
  supportsMicrophoneInput,
  onUtterance,
  onStatus,
}) {
  const controller = useStreamingCaptureController({
    modelId,
    isRealtimeEouModel,
    supportsMicrophoneInput,
    onUtterance,
    onStatus,
  });
  const snapshot = useStreamingMonitor({
    monitor: controller.monitor,
    captureInfo: controller.captureInfo,
  });

  return {
    ...controller,
    snapshot,
  };
}
