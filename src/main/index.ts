import { app, BrowserWindow } from "electron";
import * as path from "path";
import isSquirrel from "electron-squirrel-startup";
import installExtension, {
  REACT_DEVELOPER_TOOLS,
  REDUX_DEVTOOLS,
} from "electron-devtools-installer";
import Icon from "../icon/png/64x64.png";
import * as Sentry from "@sentry/electron/main";
import { getLogger } from "./base/logging";
import { exposedActionCreators, store } from "./store";
import { doPreflight } from "./preflight";
import { listenOnStore } from "./storeListener";
import { setupStoreIPC } from "./storeIpc";
import { ipcMain } from "electron/main";

setupStoreIPC(store, exposedActionCreators);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (isSquirrel) {
  app.quit();
}

const logger = getLogger("main");

/* eslint-disable no-console */
console.log = logger.debug;
console.info = logger.info;
console.warn = logger.warn;
console.error = logger.error;
/* eslint-enable no-console */

logger.info(
  `Badger Desktop v${global.__APP_VERSION__} ${global.__ENVIRONMENT__} (${global.__GIT_COMMIT__}) starting up.`,
);

if (import.meta.env.VITE_DESKTOP_SENTRY_DSN) {
  try {
    Sentry.init({
      dsn: import.meta.env.VITE_DESKTOP_SENTRY_DSN,
      release: global.__SENTRY_RELEASE__,
    });
    logger.info("[Main] Sentry enabled");
  } catch (e) {
    logger.error("[Main] Failed to initialise Sentry, continuing");
    logger.error(e);
  }
}

const createWindow = async () => {
  if (import.meta.env.DEV) {
    logger.info("Installing dev tools extensions...");
    await installExtension([REACT_DEVELOPER_TOOLS, REDUX_DEVTOOLS]);
  }

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    maxWidth: 1280,
    height: 720,
    icon: Icon,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
    },
  });

  // and load the index.html of the app.
  logger.debug("Loading main window JS...");
  if (process.env["ELECTRON_RENDERER_URL"]) {
    await mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    await mainWindow.loadFile(path.join(__dirname, `../renderer/index.html`));
  }

  listenOnStore({
    predicate: () => true,
    effect: (action, api) => {
      const state = api.getState();
      mainWindow.webContents.send("stateChange", action.type, state);
    },
  });

  // Open the DevTools.
  if (process.env.BADGER_OPEN_DEVTOOLS === "true") {
    mainWindow.webContents.openDevTools();
  }
  logger.info("Started, doing preflight...");
  store.dispatch(doPreflight());
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.on("devtools-throw-error", () => {
  if (!store.getState().settings.devtools.enabled) {
    return;
  }
  process.nextTick(() => {
    throw new Error("Test Main Process Exception");
  });
});

ipcMain.on("devtools-crash", () => {
  if (!store.getState().settings.devtools.enabled) {
    return;
  }
  process.crash();
});
