import {
  createAPIClient,
  serverAPI,
  serverApiClient,
} from "./base/serverApiClient";
import { z } from "zod";
import { callProcedure, TRPCError } from "@trpc/server";
import { selectedShow, setSelectedShow } from "./base/selectedShow";
import { Integration } from "@/common/types";
import {
  devToolsConfigSchema,
  getDevToolsConfig,
  saveDevToolsConfig,
} from "./base/settings";
import { IPCEvents } from "./ipcEventBus";
import { ipcMain } from "electron";
import logging, { logLevel, setLogLevel } from "./base/logging";
import { ontimeRouter } from "./ontime/ipc";
import { vmixRouter } from "./vmix/ipc";
import { obsRouter } from "./obs/ipc";
import { mediaRouter } from "./media/ipc";
import { proc, r } from "./base/ipcRouter";
import {
  DEV_overrideSupportedIntegrations,
  supportedIntegrations,
} from "./base/integrations";
import { CompleteShowModel, PartialShowModel } from "@/types/serverAPILenses";

const logger = logging.getLogger("ipcApi");
const rendererLogger = logging.getLogger("renderer");

export const appRouter = r({
  serverConnectionStatus: proc
    .output(
      z.object({
        ok: z.boolean(),
        warnings: z
          .object({
            versionSkew: z.boolean().optional(),
          })
          .optional(),
      }),
    )
    .query(async () => {
      if (serverApiClient === null) {
        return { ok: false };
      }
      const pingRes = await serverApiClient.ping.query();
      return {
        ok: pingRes.ping === "pong",
        warnings: {
          versionSkew: pingRes.version !== global.__APP_VERSION__,
        },
      };
    }),
  log: proc
    .input(
      z.object({
        level: z.enum(["trace", "debug", "info", "warn", "error"]),
        logger: z.string().optional(),
        message: z.string(),
      }),
    )
    .mutation(({ input }) => {
      rendererLogger[input.level](input.message);
    }),
  connectToServer: proc
    .input(
      z.object({
        endpoint: z.string().url(),
        password: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      await createAPIClient(input.endpoint + "/api/trpc", input.password);
      return true;
    }),
  listUpcomingShows: proc
    .output(z.custom<PartialShowModel[]>())
    .query(async () => {
      return await serverAPI().shows.listUpcoming.query({
        gracePeriodHours: 24,
      });
    }),
  getSelectedShow: proc
    .output(z.custom<CompleteShowModel | null>())
    .query(() => {
      return selectedShow.value ?? null;
    }),
  setSelectedShow: proc
    .input(z.object({ id: z.number() }))
    .output(z.custom<CompleteShowModel>())
    .mutation(async ({ input }) => {
      const data = await serverAPI().shows.get.query({ id: input.id });
      await setSelectedShow(data);
      return data;
    }),
  supportedIntegrations: proc.output(z.array(Integration)).query(() => {
    return supportedIntegrations;
  }),
  getLogLevel: proc
    .output(z.enum(["trace", "debug", "info", "warn", "error"]))
    .query(() => {
      return logLevel;
    }),
  setLogLevel: proc
    .input(z.enum(["trace", "debug", "info", "warn", "error"]))
    .mutation(async ({ input }) => {
      setLogLevel(input);
    }),
  devtools: r({
    getSettings: proc
      .output(devToolsConfigSchema)
      .query(() => getDevToolsConfig()),
    setSettings: proc
      .input(devToolsConfigSchema)
      .mutation(async ({ input }) => {
        logger.info("Dev Tools settings change: " + JSON.stringify(input));
        await saveDevToolsConfig(input);
        IPCEvents.send("devToolsSettingsChange");
      }),
    throwException: proc.mutation(async () => {
      if (!(await getDevToolsConfig()).enabled) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Dev tools not enabled",
        });
      }
      process.nextTick(() => {
        throw new Error("Test Main Process Exception");
      });
    }),
    crash: proc.mutation(async () => {
      if (!(await getDevToolsConfig()).enabled) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Dev tools not enabled",
        });
      }
      process.crash();
    }),
    setEnabledIntegrations: proc
      .input(z.array(z.string()))
      .mutation(async ({ input }) => {
        if (!(await getDevToolsConfig()).enabled) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Dev tools not enabled",
          });
        }
        DEV_overrideSupportedIntegrations(input as Integration[]);
      }),
  }),
  media: mediaRouter,
  obs: obsRouter,
  vmix: vmixRouter,
  ontime: ontimeRouter,
});
export type AppRouter = typeof appRouter;

if (process.env.E2E_TEST === "true") {
  ipcMain.on("doIPCMutation", async (_, proc: string, input: unknown) => {
    logger.debug(
      "doIPCMutation: " + JSON.stringify(proc) + " " + JSON.stringify(input),
    );
    await callProcedure({
      procedures: appRouter._def.procedures,
      path: proc,
      rawInput: input,
      ctx: {},
      type: "mutation",
    });
  });
}
