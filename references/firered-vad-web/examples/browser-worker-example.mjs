import { createFireRedBrowserWorkerClient } from '../dist/platform/browser/index.js';

const workerClient = createFireRedBrowserWorkerClient();
await workerClient.init(
  'https://raw.githubusercontent.com/FireRedTeam/FireRedVAD/main/pretrained_models/onnx_models/',
);

const chunk = new Int16Array(400);
const result = await workerClient.process(chunk);
console.log(result);
await workerClient.dispose();
