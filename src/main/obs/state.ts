import { createAsyncThunk, isAnyOf } from "@reduxjs/toolkit";
import { createAppSlice } from "../base/reduxHelpers";
import { createOBSConnection, obsConnection } from "./obs";
import { AppState } from "../store";
import { getLogger } from "../base/logging";
import { addOrReplaceMediaAsScene, findContinuityScenes } from "./obsHelpers";
import { listenOnStore } from "../storeListener";
import { serverAPI } from "../base/serverApiClient";
import invariant from "../../common/invariant";
import { OBSRequestTypes, OBSResponseTypes } from "obs-websocket-js";

const logger = getLogger("obs/state");

export const obsSlice = createAppSlice({
  name: "obs",
  initialState: {
    connection: {
      connected: false,
      connecting: false,
      version: "",
      platform: "",
      availableRequests: [] as string[],
      error: null as string | null,
    },
    continuityScenes: [] as {
      continuityItemID: number;
      sources: { mediaID?: number }[];
    }[],
    arbitraryCallResult: null as
      | null
      | OBSResponseTypes[keyof OBSResponseTypes],
  },
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(connectToOBS.pending, (state) => {
      state.connection.connecting = true;
    });
    builder.addCase(connectToOBS.rejected, (state, action) => {
      state.connection.error = action.error.message ?? "Unknown error";
      state.connection.connecting = false;
    });

    builder.addCase(updateContinuityScenes.fulfilled, (state, action) => {
      state.continuityScenes = action.payload.map((s) => ({
        continuityItemID: s.continuityItemID,
        sources: s.sources.map((src) => ({ mediaID: src.mediaID })),
      }));
    });
    // rejected handled in globalError

    builder.addCase(addContinuityItemAsScene.fulfilled, (state, action) => {
      if (action.payload.newScenes) {
        state.continuityScenes = action.payload.newScenes.map((s) => ({
          continuityItemID: s.continuityItemID,
          sources: s.sources.map((src) => ({ mediaID: src.mediaID })),
        }));
      }
    });

    builder.addCase(callArbitrary.fulfilled, (state, action) => {
      // @ts-expect-error type too complex
      state.arbitraryCallResult = action.payload;
    });

    builder.addMatcher(
      isAnyOf(connectToOBS.fulfilled, tryConnectToOBS.fulfilled),
      (state, data) => {
        if ("obsVersion" in data.payload) {
          state.connection.connected = true;
          state.connection.connecting = false;
          state.connection.version = data.payload.obsVersion;
          state.connection.platform = data.payload.platformDescription;
          state.connection.availableRequests = data.payload.availableRequests;
        }
      },
    );
  },
});

export const connectToOBS = createAsyncThunk(
  "obs/connect",
  async (payload: { host: string; password: string; port?: number }) => {
    return await createOBSConnection(
      payload.host,
      payload.password,
      payload.port,
    );
  },
);

export const tryConnectToOBS = createAsyncThunk(
  "obs/tryConnect",
  async (_, api) => {
    const settings = (api.getState() as AppState).settings.obs;
    if (!settings.host || !settings.password) {
      logger.info("No OBS settings, skipping connection attempt");
      // Include _something_ in the fulfilment payload for ease of debugging
      return { skipped: true };
    }
    try {
      const r = await createOBSConnection(
        settings.host,
        settings.password,
        settings.port,
      );
      logger.info("Connected to OBS using saved credentials");
      return r;
    } catch (e) {
      logger.info(`Failed to connect to OBS using saved credentials: ${e}`);
      return { failed: true };
    }
  },
);

export const callArbitrary = createAsyncThunk(
  "obs/callArbitrary",
  async (
    payload: {
      req: keyof OBSRequestTypes;
      data?: OBSRequestTypes[keyof OBSRequestTypes];
    },
    api,
  ) => {
    const state = api.getState() as AppState;
    if (!state.settings.devtools.enabled) {
      return api.rejectWithValue("Dev tools are disabled");
    }
    invariant(obsConnection, "OBS connection not initialized");
    const res = await obsConnection.callArbitraryDoNotUseOrYouWillBeFired(
      payload.req,
      payload.data,
    );
    return res;
  },
);

export const updateContinuityScenes = createAsyncThunk(
  "obs/updateContinuityScenes",
  async () => {
    return await findContinuityScenes();
  },
);

// Update continuity scenes every 10 seconds
listenOnStore({
  matcher: isAnyOf(tryConnectToOBS.fulfilled, connectToOBS.fulfilled),
  effect: async (_, api) => {
    logger.info("Connected to OBS, starting continuity scene updates loop");
    api.cancelActiveListeners();
    for (;;) {
      await api.dispatch(updateContinuityScenes());
      await api.delay(10_000);
    }
  },
});

export const addContinuityItemAsScene = createAsyncThunk(
  "obs/addContinuityItemAsScene",
  async (
    payload: {
      continuityItemID: number;
      replaceMode?: "none" | "replace" | "force";
    },
    api,
  ) => {
    const state = api.getState() as AppState;
    const show = state.selectedShow.show;
    invariant(show, "No show selected");
    const item = show.continuityItems.find(
      (x) => x.id === payload.continuityItemID,
    );
    invariant(item, "Continuity item not found");
    invariant(item.media, "Continuity item has no media");
    const info = await serverAPI().media.get.query({ id: item.media.id });
    const result = await addOrReplaceMediaAsScene(
      info,
      payload.replaceMode ?? "none",
      show,
      state.localMedia.media,
    );
    if (result.done) {
      return {
        ...result,
        newScenes: await findContinuityScenes(),
      };
    }
    return {
      ...result,
      newScenes: null,
    };
  },
);
