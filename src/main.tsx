import React from "react";
import ReactDOM from "react-dom/client";
/* Fonts are bundled (no Google Fonts request → no third party ever sees a visit). */
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./styles/base.css";
import "./styles/shell.css";
import App from "./App";
import { paintCachedTheme } from "./lib/appearance";

paintCachedTheme();

/* Ask the browser not to evict IndexedDB under storage pressure. */
if (navigator.storage?.persist) void navigator.storage.persist();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("./sw.js"));
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
