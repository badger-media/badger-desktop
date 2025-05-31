import { createSlice } from "@reduxjs/toolkit";
import { AppThunk } from "./store";
import { initialiseSettings } from "./base/settings";
import { localMediaActions } from "./media/state";
import { WritableDraft } from "immer";
import { tryConnectToServer } from "./base/serverConnectionState";
import { tryConnectToOBS as tryConnectToOBS } from "./obs/state";
import { tryConnectToOntime } from "./ontime/state";
import { tryConnectToVMix } from "./vmix/state";
import { getLogger } from "./base/logging";
import { listenOnStore } from "./storeListener";

const logger = getLogger("preflight");

/**
 * Array of preflight checks to be executed during application startup.
 * These checks handle initialization of settings, media, and connections to various services.
 *
 * @typedef {Object} PreflightCheck
 * @property {string} name - Display name of the preflight check
 * @property {Function} thunk - Redux async thunk to dispatch to execute for this preflight check
 * @property {boolean} [first] - If true, this check should be executed before others
 * @property {boolean} [noDelay] - If true, this check does not block app startup and can finish after the user gets to the main screen
 */
const PREFLIGHTS = [
  { name: "Settings", thunk: initialiseSettings, first: true },
  { name: "Local media", thunk: localMediaActions.initialise },
  { name: "Server connection", thunk: tryConnectToServer },
  { name: "OBS connection", thunk: tryConnectToOBS, noDelay: true },
  { name: "Ontime connection", thunk: tryConnectToOntime, noDelay: true },
  { name: "vMix Connection", thunk: tryConnectToVMix, noDelay: true },
];

export interface PreflightTask {
  name: string;
  status: "pending" | "success" | "error";
  error?: string;
}

const preflightSlice = createSlice({
  name: "preflight",
  initialState: {
    tasks: [] as PreflightTask[],
    done: false,
  },
  reducers: {},
  extraReducers: (builder) => {
    const NEEDED = PREFLIGHTS.filter((x) => !x.noDelay).length;
    for (const { name, thunk } of PREFLIGHTS) {
      builder.addCase(thunk.pending, (state) => {
        state.tasks.push({ name, status: "pending" });
      });
      builder.addCase(thunk.fulfilled, (state) => {
        const task = state.tasks.find(
          (t) => t.name === name,
        ) as WritableDraft<PreflightTask>;
        task.status = "success";
        const done = state.tasks.filter((t) => t.status === "success").length;
        if (done === NEEDED) {
          state.done = true;
        }
      });
      builder.addCase(thunk.rejected, (state, action) => {
        const task = state.tasks.find(
          (t) => t.name === name,
        ) as WritableDraft<PreflightTask>;
        task.status = "error";
        task.error = action.error.message ?? "Unknown error";
      });
    }
  },
});

listenOnStore({
  predicate: (_, cur, prev) => cur.preflight.done !== prev.preflight.done,
  effect: (action, api) => {
    const state = api.getState();
    if (state.preflight.done) {
      logger.info("Preflight complete");
    }
  },
});

export const preflightReducer = preflightSlice.reducer;

export const doPreflight: () => AppThunk = () => async (dispatch) => {
  for (const task of PREFLIGHTS.filter((x) => x.first)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await dispatch(task.thunk() as any);
  }
  logger.info("Early preflight complete");
  for (const task of PREFLIGHTS.filter((x) => !x.first)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dispatch(task.thunk() as any);
  }
};
