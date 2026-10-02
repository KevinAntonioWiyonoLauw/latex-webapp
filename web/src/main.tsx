import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { setupMonaco } from "./monaco";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./index.css";

setupMonaco();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={300}>
      <App />
      <Toaster position="bottom-right" theme="dark" richColors />
    </TooltipProvider>
  </React.StrictMode>,
);
