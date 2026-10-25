import React from "react";
import { createRoot } from "react-dom/client";
import { createSpeechController } from "@asrjs/speech-recognition/controller";
import App from "./App.js";
import "../shared/styles.css";

const mount = document.getElementById("root");
if (!mount) throw new Error("Missing #root element.");

const controller = createSpeechController();
const root = createRoot(mount);
root.render(
  <React.StrictMode>
    <App controller={controller} />
  </React.StrictMode>,
);

window.addEventListener(
  "pagehide",
  () => {
    root.unmount();
    void controller.dispose().catch((error: unknown) => {
      console.error("Speech controller cleanup failed", error);
    });
  },
  { once: true },
);
