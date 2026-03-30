import { createFireRedBrowserWorkerClient } from '../dist/platform/browser/index.js';

const workerClient = createFireRedBrowserWorkerClient();
await workerClient.init(
  'https://huggingface.co/FireRedTeam/FireRedVAD/resolve/main/onnx_models/',
);

const chunk = new Int16Array(400);
const result = await workerClient.process(chunk);
console.log(result);
await workerClient.dispose();