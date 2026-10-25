<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import { buildSpeechModelLoadOptions } from "@asrjs/speech-recognition";
import { createSpeechController } from "@asrjs/speech-recognition/controller";
import { useSpeechRecognition } from "@asrjs/speech-recognition-vue";

const controller = createSpeechController();
const { state } = useSpeechRecognition(controller);
const audioFile = ref<File | null>(null);
const errorText = ref("");
const busy = ref(false);
let active = true;
const backend = ref<"wasm" | "webgpu-hybrid">("webgpu-hybrid");
const modelId = "parakeet-tdt-0.6b-v2";

async function loadModel() {
  if (busy.value || !active) return;
  busy.value = true;
  errorText.value = "";
  try {
    await controller.load(
      buildSpeechModelLoadOptions({ modelId, backend: backend.value }),
    );
  } catch (error) {
    if (active)
      errorText.value = error instanceof Error ? error.message : String(error);
  } finally {
    if (active) busy.value = false;
  }
}

async function transcribeFile() {
  const selectedFile = audioFile.value;
  if (!selectedFile || busy.value || !active) return;
  busy.value = true;
  errorText.value = "";
  try {
    await controller.transcribeSource(selectedFile);
  } catch (error) {
    if (active)
      errorText.value = error instanceof Error ? error.message : String(error);
  } finally {
    if (active) busy.value = false;
  }
}

async function controlMicrophone(start: boolean) {
  if (!active || (start && busy.value)) return;
  busy.value = true;
  errorText.value = "";
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
    if (active && !(error instanceof Error && error.name === "AbortError"))
      errorText.value = error instanceof Error ? error.message : String(error);
  } finally {
    if (active) busy.value = false;
  }
}

onUnmounted(() => {
  active = false;
  void controller
    .dispose()
    .catch((error: unknown) =>
      console.error("Speech controller cleanup failed", error),
    );
});
</script>

<template>
  <main class="app">
    <h1>Speech recognition</h1>
    <section class="section" aria-label="Model setup">
      <label for="model">Model</label>
      <input id="model" value="Parakeet TDT 0.6B v2" readonly />
      <div class="controls">
        <label for="backend">Backend</label>
        <select
          id="backend"
          v-model="backend"
          :disabled="busy || state.status === 'streaming'"
        >
          <option value="webgpu-hybrid">WebGPU hybrid</option>
          <option value="wasm">WASM</option>
        </select>
        <button
          :disabled="busy || state.status === 'streaming'"
          @click="loadModel"
        >
          {{ busy && state.status === "loading" ? "Loading…" : "Load model" }}
        </button>
      </div>
      <p role="status">
        {{
          state.status === "loading"
            ? (state.progress?.message ?? "Loading model")
            : state.status
        }}
      </p>
      <p
        v-for="(warning, index) in state.loadWarnings"
        :key="`${warning.code}:${index}`"
        role="status"
      >
        {{ warning.message }}
      </p>
    </section>

    <section class="section" aria-label="Audio">
      <label for="audio-file">Audio file</label>
      <input
        id="audio-file"
        type="file"
        accept="audio/*"
        :disabled="busy"
        @change="
          audioFile = ($event.target as HTMLInputElement).files?.[0] ?? null
        "
      />
      <div class="controls">
        <button
          :disabled="!audioFile || busy || state.status !== 'ready'"
          @click="transcribeFile"
        >
          Transcribe
        </button>
      </div>
      <template v-if="state.result">
        <h2>Transcript</h2>
        <output class="result">{{
          state.microphone?.transcriptText ?? state.result.text
        }}</output>
      </template>
    </section>

    <div class="controls">
      <button
        :disabled="busy || state.status !== 'ready'"
        @click="controlMicrophone(true)"
      >
        Microphone
      </button>
      <button
        :disabled="!state.microphone?.isMicActive"
        @click="controlMicrophone(false)"
      >
        Stop microphone
      </button>
    </div>
    <p
      v-if="errorText || state.error || state.microphone?.micError"
      class="error"
      role="alert"
    >
      {{ errorText || state.microphone?.micError || String(state.error) }}
    </p>
  </main>
</template>
