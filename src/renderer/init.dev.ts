import invariant from "@/common/invariant";
import { Dispatch } from "@reduxjs/toolkit";
import isElectron from "is-electron";

// Initialises MainStoreAPI when we're not running in Electron.
if (import.meta.env.DEV && !isElectron()) {
  window.MainStoreAPI = {
    _dispatch: ((actionType, ...args) => {
      const resultPromise = (async () => {
        const response = await fetch("/_dev/dispatch/" + actionType, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(args),
        });
        return await response.json();
      })();
      // Redux Toolkit async thunks' action creators return a promise, with a special
      // unwrap method: https://redux-toolkit.js.org/api/createAsyncThunk#unwrapping-result-actions
      // Effectively this returns a promise that either resolves to the payload or rejects with
      // the error.
      // We can't transfer promises over HTTP, but the dev server has already awaited it and
      // will give us the resolved value or the reject reason. So we can fake it locally
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (resultPromise as any).unwrap = async () => {
        const resAction = await resultPromise;
        const meta = resAction.meta as {
          requestId: string;
          requestStatus: "fulfilled" | "rejected";
        };
        invariant(
          typeof meta.requestStatus === "string",
          "init.dev.ts: called unwrap, but resAction.meta had no requestStatus",
        );
        if (meta.requestStatus === "fulfilled") {
          return resAction.payload;
        }
        if (meta.requestStatus === "rejected") {
          throw resAction.payload ?? resAction.error;
        }
        invariant(false, `unexpected requestStatus ${meta.requestStatus}`);
      };
      return resultPromise;
    }) as Dispatch,
    getState: async () => {
      const result = await fetch("/_dev/getState");
      return result.json();
    },
    onStateChange: (callback) => {
      const ws = new WebSocket(`ws://${location.host}/_dev`);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        callback("@@dev/" + data.type, data.state);
      };
      ws.onclose = () => {
        window.location.reload();
      };
    },
  };
}
