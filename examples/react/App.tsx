import { useState, type ChangeEvent } from "react";
import { buildSpeechModelLoadOptions } from "@asrjs/speech-recognition";
import type { MicrophoneSpeechController } from "@asrjs/speech-recognition/controller";
import { decodeAudioSourceToMonoPcm } from "@asrjs/speech-recognition/browser/media";
import { useSpeechRecognition } from "@asrjs/speech-recognition-react";

interface AppProps {
  readonly controller: MicrophoneSpeechController;
}

const MODEL_ID = "parakeet-tdt-0.6b-v2";

export default function App({ controller }: AppProps) {
  const { state } = useSpeechRecognition(controller);
  const [backend, setBackend] = useState<"webgpu-hybrid" | "wasm">(
    "webgpu-hybrid",
  );
  const [audio, setAudio] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadModel() {
    setActionError(null);
    try {
      await controller.load(
        buildSpeechModelLoadOptions({ modelId: MODEL_ID, backend }),
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    setAudio(event.currentTarget.files?.[0] ?? null);
    setActionError(null);
  }

  async function transcribe() {
    if (!audio) return;
    setWorking(true);
    setActionError(null);
    try {
      await controller.transcribeSource(audio);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  }

  async function transcribeAsStream() {
    if (!audio) return;
    setWorking(true);
    setActionError(null);
    try {
      const decoded = await decodeAudioSourceToMonoPcm(audio, {
        targetSampleRate: 16000,
      });
      await controller.startStreaming({ emitPartials: true });
      const chunkFrames = Math.round(decoded.sampleRate * 0.32);
      for (let start = 0; start < decoded.pcm.length; start += chunkFrames) {
        const end = Math.min(start + chunkFrames, decoded.pcm.length);
        await controller.pushAudio(
          decoded.pcm.subarray(start, end),
          decoded.sampleRate,
        );
      }
      await controller.finalizeStreaming();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  }

  async function controlMicrophone(start: boolean) {
    setActionError(null);
    setWorking(true);
    try {
      if (start)
        await controller.startMicrophone({
          config: {
            gateMode: "vad-only",
            vadBackend: "ten-vad",
            tenVadEnabled: true,
          },
        });
      else await controller.stopMicrophone();
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError"))
        setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  }

  const loaded =
    state.modelId !== null &&
    state.status !== "loading" &&
    state.status !== "disposed";
  const modelBusy =
    working || state.status === "loading" || state.status === "streaming";
  const transcript =
    state.microphone?.transcriptText ??
    state.result?.text ??
    state.partial?.text ??
    "";
  const errorText =
    actionError ??
    (state.error instanceof Error
      ? state.error.message
      : state.error == null
        ? null
        : String(state.error)) ??
    (state.microphone?.micError || null);

  return (
    <main className="app">
      <h1>Speech recognition</h1>

      <label htmlFor="model">Model</label>
      <input id="model" value="Parakeet TDT 0.6B v2" readOnly />

      <label htmlFor="backend">Backend</label>
      <select
        id="backend"
        value={backend}
        onChange={(event) =>
          setBackend(event.currentTarget.value as typeof backend)
        }
        disabled={loaded || working}
      >
        <option value="webgpu-hybrid">WebGPU hybrid</option>
        <option value="wasm">WASM</option>
      </select>

      <div className="controls">
        <button
          type="button"
          onClick={() => void loadModel()}
          disabled={loaded || modelBusy}
        >
          {state.status === "loading" ? "Loading model" : "Load model"}
        </button>
        <label>
          Audio file
          <input
            type="file"
            accept="audio/*"
            onChange={(event) => void selectFile(event)}
            disabled={working}
          />
        </label>
        {audio && <p>{audio.name}</p>}
        <button
          type="button"
          onClick={() => void transcribe()}
          disabled={!loaded || !audio || modelBusy}
        >
          Transcribe
        </button>
        {state.supportsStreaming && (
          <button
            type="button"
            onClick={() => void transcribeAsStream()}
            disabled={!loaded || !audio || modelBusy}
          >
            Stream chunks
          </button>
        )}
      </div>

      <p role="status" aria-live="polite">
        {state.status === "loading"
          ? (state.progress?.message ?? "Loading model")
          : state.status}
      </p>
      <div className="controls">
        <button
          type="button"
          onClick={() => void controlMicrophone(true)}
          disabled={modelBusy || state.status !== "ready"}
        >
          Microphone
        </button>
        <button
          type="button"
          onClick={() => void controlMicrophone(false)}
          disabled={!state.microphone?.isMicActive}
        >
          Stop microphone
        </button>
      </div>
      {(state.loadWarnings ?? []).map((warning, index) => (
        <p role="status" key={`${warning.code}:${index}`}>
          {warning.message}
        </p>
      ))}
      {errorText !== null && (
        <p className="error" role="alert">
          {errorText}
        </p>
      )}
      {transcript && <output className="result">{transcript}</output>}
    </main>
  );
}
