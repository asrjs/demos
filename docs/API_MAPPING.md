# API Mapping

## Python-style class API

- `FireRedStreamVad.from_pretrained()` / `fromPretrained()`
- `detect_frame()` / `detectFrame()`
- `detect_chunk()` / `detectChunk()`
- `detect_full()` / `detectFull()`
- `set_mode()` / `setMode()`

- `FireRedVad.from_pretrained()` / `fromPretrained()`
- `detect()`

- `FireRedAed.from_pretrained()` / `fromPretrained()`
- `detect()`

## Function helpers

- `non_stream_vad()` / `nonStreamVad()`
- `stream_vad_full()` / `streamVadFull()`
- `non_stream_aed()` / `nonStreamAed()`

## C-style stream adapter semantics

- `FireredVadStreamPacked.create()`
- `process_stream()` / `processStream()`
- `get_frame_offset()` / `getFrameOffset()`
- `reset()`
- `destroy()`