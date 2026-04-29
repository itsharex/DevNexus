import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, theme as antdTheme } from "antd";
import App from "./App";
import { registerBuiltinPlugins } from "@/app/plugin-registry/builtin";
import { useThemeStore } from "@/app/store/theme";
import "antd/dist/reset.css";
import "@/styles/global.css";

registerBuiltinPlugins();

function Root() {
  const mode = useThemeStore((state) => state.mode);

  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = mode;
  }

  return (
    <ConfigProvider
      theme={{
        algorithm:
          mode === "dark"
            ? antdTheme.darkAlgorithm
            : antdTheme.defaultAlgorithm,
      }}
    >
      <App />
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
