<script lang="ts">
  import { onDestroy } from 'svelte';
  import { buildSpeechModelLoadOptions } from '@asrjs/speech-recognition';
  import { createSpeechController } from '@asrjs/speech-recognition/controller';
  import { createSpeechRecognitionStore } from '@asrjs/speech-recognition-svelte';

  const controller = createSpeechController();
  const recognition = createSpeechRecognitionStore(controller);
  let audioFile: File | null = null;
  let errorText = '';
  let busy = false;
  let active = true;
  let backend: 'wasm' | 'webgpu-hybrid' = 'webgpu-hybrid';
  const modelId = 'parakeet-tdt-0.6b-v2';

  async function loadModel() {
    if (busy || !active) return;
    busy = true;
    errorText = '';
    try {
      await controller.load(buildSpeechModelLoadOptions({ modelId, backend }));
    } catch (error) {
      if (active) errorText = error instanceof Error ? error.message : String(error);
    } finally {
      if (active) busy = false;
    }
  }

  async function transcribeFile() {
    const selectedFile = audioFile;
    if (!selectedFile || busy || !active) return;
    busy = true;
    errorText = '';
    try {
      await controller.transcribeSource(selectedFile);
    } catch (error) {
      if (active) errorText = error instanceof Error ? error.message : String(error);
    } finally {
      if (active) busy = false;
    }
  }

  async function controlMicrophone(start: boolean) {
    if (!active || (start && busy)) return;
    busy = true;
    errorText = '';
    try {
      if (start) await controller.startMicrophone({ config: { gateMode: 'vad-only', vadBackend: 'ten-vad', tenVadEnabled: true } });
      else await controller.stopMicrophone();
    } catch (error) {
      if (active && !(error instanceof Error && error.name === 'AbortError')) errorText = error instanceof Error ? error.message : String(error);
    } finally { if (active) busy = false; }
  }

  onDestroy(() => {
    active = false;
    void controller.dispose().catch((error: unknown) => console.error('Speech controller cleanup failed', error));
  });
</script>

<svelte:head>
  <title>Speech recognition · Svelte</title>
</svelte:head>

<main class="app">
  <h1>Speech recognition</h1>
  <section class="section" aria-label="Model setup">
    <label for="model">Model</label>
    <input id="model" value="Parakeet TDT 0.6B v2" readonly />
    <div class="controls">
      <label for="backend">Backend</label>
      <select id="backend" bind:value={backend} disabled={busy || $recognition.status === 'streaming'}>
        <option value="webgpu-hybrid">WebGPU hybrid</option>
        <option value="wasm">WASM</option>
      </select>
      <button onclick={loadModel} disabled={busy || $recognition.status === 'streaming'}>
        {busy && $recognition.status === 'loading' ? 'Loading…' : 'Load model'}
      </button>
    </div>
    <p role="status">{$recognition.status === 'loading' ? ($recognition.progress?.message ?? 'Loading model') : $recognition.status}</p>
    {#each $recognition.loadWarnings ?? [] as warning}
      <p role="status">{warning.message}</p>
    {/each}
  </section>

  <section class="section" aria-label="Audio">
    <label for="audio-file">Audio file</label>
    <input id="audio-file" type="file" accept="audio/*" disabled={busy} onchange={(event) => (audioFile = event.currentTarget.files?.[0] ?? null)} />
    <div class="controls"><button onclick={transcribeFile} disabled={!audioFile || busy || $recognition.status !== 'ready'}>Transcribe</button></div>
    {#if $recognition.result}
      <h2>Transcript</h2>
      <output class="result">{$recognition.microphone?.transcriptText ?? $recognition.result.text}</output>
    {/if}
  </section>

  {#if errorText || $recognition.error || $recognition.microphone?.micError}
    <p class="error" role="alert">{errorText || $recognition.microphone?.micError || String($recognition.error)}</p>
  {/if}
  <div class="controls">
    <button onclick={() => controlMicrophone(true)} disabled={busy || $recognition.status !== 'ready'}>Microphone</button>
    <button onclick={() => controlMicrophone(false)} disabled={!$recognition.microphone?.isMicActive}>Stop microphone</button>
  </div>
</main>
