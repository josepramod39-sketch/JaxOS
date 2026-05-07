import React from "react";
import { render } from "ink";
import { App } from "./App.tsx";

const { unmount } = render(<App />, { exitOnCtrlC: true });

process.on("SIGTERM", () => unmount());
