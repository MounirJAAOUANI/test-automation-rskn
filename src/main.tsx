import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./client/index.css";
// import App from './App.tsx'
import AutoPilotDashboard from "./client/autopilot_dashboard.jsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AutoPilotDashboard />
  </StrictMode>,
);
