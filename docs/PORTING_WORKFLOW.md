# Porting Workflow (Node First)

1. Build package: `npm run build`.
2. Validate upstream assets: `npm run upstream:check`.
3. Run Node parity smoke: `npm run parity:node`.
4. Compare output JSON in `tools/parity/out/` against native references.
5. Move to browser validation after Node parity is stable.

## Current Scope

- Stream VAD (`fireredvad_stream_vad_with_cache.onnx`)
- Non-stream VAD (`fireredvad_vad.onnx`)
- AED (`fireredvad_aed.onnx`)

## Converter Status

- v1 includes a stub upstream validator and manifest recorder.
- Full automatic pull/export/regenerate pipeline is intentionally deferred.