import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createMockProviders } from "@/frontend/adapters/mock/providers";
import "@/frontend/styles/index.css";
let shouldFail =
  new URLSearchParams(window.location.search).get("fail") === "once";
const providers = createMockProviders({
  failNext: () => {
    if (!shouldFail) return false;
    shouldFail = false;
    return true;
  },
});
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App providers={providers} />
  </StrictMode>,
);
