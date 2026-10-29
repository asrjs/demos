# TEN-VAD Web build

`ten_vad.js` and `ten_vad.wasm` come unmodified from
[TEN-framework/ten-vad](https://github.com/TEN-framework/ten-vad/tree/d68ab71c8d5f/lib/Web)
at commit `d68ab71c8d5f`. The Realtime app hosts them for its own users and
passes this folder as `tenVadConfig.assetBaseUrl`; `@asrjs/speech-recognition`
does not bundle TEN-VAD.

TEN-VAD is licensed under Apache-2.0 with additional conditions; see
[LICENSE-ten-vad](LICENSE-ten-vad) and [NOTICES-ten-vad](NOTICES-ten-vad).
Powered by ten-vad.
