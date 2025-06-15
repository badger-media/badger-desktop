import {
  Action,
  configureStore,
  Middleware,
  ThunkAction,
} from "@reduxjs/toolkit";
import { combineReducers } from "redux";
import { devToolsEnhancer as remoteReduxDevToolsEnhancer } from "@redux-devtools/remote";
import { setSetting, settingsReducer } from "./base/settings";
import { listener } from "./storeListener";
import { localMediaActions, localMediaReducer } from "./media/state";
import {
  _enterReducer,
  _exitReducer,
  changeSelectedShow,
  selectedShowReducer,
} from "./base/selectedShow";
import { preflightReducer } from "./preflight";
import {
  connectToServer,
  serverConnectionReducer,
} from "./base/serverConnectionState";
import { getLogger } from "./base/logging";
import { inspect } from "util";
import { serverDataSlice } from "./base/serverDataState";
import {
  addContinuityItemAsScene,
  callArbitrary,
  connectToOBS,
  obsSlice,
} from "./obs/state";
import {
  integrationsReducer,
  overrideSupportedIntegrations,
} from "./base/integrations";
import { connectToOntime, ontimeReducer, pushEvents } from "./ontime/state";
import {
  connectToVMix,
  loadAllVTs,
  loadAssets,
  loadSingleVT,
  switchActiveRundown,
  vmixReducer,
} from "./vmix/state";
import { dismissGlobalError, globalErrorReducer } from "./globalError";
import { cloneDeep, merge } from "lodash";

const logger = getLogger("store");

const loggerMiddleware: Middleware = (_store) => (next) => (action) => {
  if (typeof action !== "object" || action === null) {
    return next(action);
  }
  const type = (action as Action).type;
  if (type.endsWith("rejected")) {
    logger.warn(`action: ${type}`);
    logger.warn(inspect(action));
  } else {
    logger.info(`action: ${type}`);
    logger.debug(inspect(action));
  }
  return next(action);
};

const topReducer = combineReducers({
  selectedShow: selectedShowReducer, // but see below, it's called slightly differently
  globalError: globalErrorReducer,
  settings: settingsReducer,
  localMedia: localMediaReducer,
  preflight: preflightReducer,
  serverConnection: serverConnectionReducer,
  serverData: serverDataSlice.reducer,
  obs: obsSlice.reducer,
  integrations: integrationsReducer,
  ontime: ontimeReducer,
  vmix: vmixReducer,
});

export interface AppState extends ReturnType<typeof topReducer> {
  selectedShow: ReturnType<typeof selectedShowReducer>;
}

export const store = configureStore({
  reducer: (state: AppState | undefined, action) => {
    // Allow resetting the state in tests
    if (action.type === "@@RESET") {
      state = undefined;
    }
    if (action.type === "@@PRELOAD") {
      if (!state) {
        state = topReducer(state, { type: "@@INIT" });
      } else {
        state = cloneDeep(state);
      }
      merge(state, action.payload);
    }
    // Since nearly every other bit of the application depends on the selected show,
    // we have a shortcut to allow all the other reducers to access it without embedding
    // it in their state. In effect, we temporarily set the selected show as a global variable,
    // expose it to reducers through the getSelectedShow function, and then immediately unset it.
    //
    // This seems like a side effect and thus forbidden in Redux, but it's actually
    // valid, since it's only used within the reducer function itself.
    // This is a way to apply the "reducer composition" pattern within the constraints
    // of Redux Toolkit. The "clean" Redux way would be for all the other reducers to
    // take the current show state as a third argument, but Redux Toolkit doesn't support
    // this and we don't want to re-implement it. So we use this global as a pseudo-argument.
    //
    // Note that, if any other slices want to react to changes in the selected show, as opposed
    // to merely reading it while they handle an action originating from their own slice, they
    // will need to include showDataChangeMatcher as a reducer case as normal.
    const selectedShowState = selectedShowReducer(state?.selectedShow, action);
    _enterReducer(selectedShowState.show);
    // This calls selectedShowReducer again, but that's okay because it's being called with
    // the same state and action.
    const newState = topReducer(state, action);
    _exitReducer();
    return newState;
  },
  middleware: (def) =>
    def({
      serializableCheck: false, // we have Dates in our state
    }).concat(listener.middleware, loggerMiddleware),

  enhancers: (def) =>
    import.meta.env.BADGER_ENABLE_REDUX_DEVTOOLS !== "true"
      ? def()
      : def().concat(
          remoteReduxDevToolsEnhancer({ hostname: "localhost", port: 5175 }),
        ),
});

export type AppStore = typeof store;
export type AppDispatch = typeof store.dispatch;
export type AppThunk<A = void> = ThunkAction<A, AppState, unknown, Action>;

export const exposedActionCreators = {
  dismissGlobalError,
  connectToServer,
  changeSelectedShow,
  queueMediaDownload: localMediaActions.queueMediaDownload,
  downloadAllMediaForSelectedShow:
    localMediaActions.downloadAllMediaForSelectedShow,
  obsConnect: connectToOBS,
  addContinuityItemAsScene,
  connectToOntime,
  pushEvents,
  connectToVMix,
  switchActiveRundown,
  loadAllVTs,
  loadSingleVT,
  loadAssets,
  overrideSupportedIntegrations,
  setSetting,
  obsCallArbitrary: callArbitrary,
  deleteOldMedia: localMediaActions.deleteOldMedia,
};
export type ExposedActionCreators = typeof exposedActionCreators;
