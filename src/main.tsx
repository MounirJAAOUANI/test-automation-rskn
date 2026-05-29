import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AppFactory from "./app_factory_pipeline";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppFactory />
  </StrictMode>,
);
