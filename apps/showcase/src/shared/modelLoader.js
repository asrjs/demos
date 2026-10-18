import { createDemoHubLoader } from "@asrjs/demo-runtime";

const loader = createDemoHubLoader();
export const loadHubDemoModel = options => loader.loadModel(options);
export const disposeHubDemoPipeline = () => loader.dispose();
