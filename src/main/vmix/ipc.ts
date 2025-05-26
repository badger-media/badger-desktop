import { z } from "zod";
import { proc, r } from "../base/ipcRouter";
import { createVMixConnection, getVMixConnection } from "./vmix";
import { getLogger } from "../base/logging";
import invariant from "@/common/invariant";
import { serverAPI } from "../base/serverApiClient";
import { TRPCError } from "@trpc/server";
import {
  addSingleItemToList,
  isListPlaying,
  loadAssets,
  reconcileList,
} from "./vmixHelpers";
import { VMIX_NAMES } from "@/common/constants";
import { getLocalMedia } from "../media/mediaManagement";

const logger = getLogger("vmix/ipc");

export const vmixRouter = r({
  getConnectionState: proc
    .output(
      z.object({
        connected: z.boolean(),
        host: z.string().optional(),
        port: z.number().optional(),
        version: z.string().optional(),
        edition: z.string().optional(),
      }),
    )
    .query(async () => {
      // TODO[BDGR-136]: don't use the connection for this
      const conn = getVMixConnection();
      if (conn === null) {
        return { connected: false };
      }
      const state = await conn.getFullState();
      logger.debug("VMix state", state);
      return {
        connected: true,
        host: conn.host,
        port: conn.port,
        version: state.version,
        edition: state.edition,
      };
    }),
  tryConnect: proc
    .input(
      z.object({
        host: z.string(),
        port: z.number(),
      }),
    )
    .output(
      z.object({
        connected: z.boolean(),
        version: z.string().optional(),
        edition: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const conn = await createVMixConnection(input.host, input.port);
      const state = await conn.getFullState();
      return {
        connected: true,
        version: state.version,
        edition: state.edition,
      };
    }),
  getCompleteState: proc.query(() => {
    const conn = getVMixConnection();
    invariant(conn, "No vMix connection");
    return conn.getFullState();
  }),
  loadRundownVTs: proc
    .input(
      z.object({
        rundownID: z.number(),
        force: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      if (!input.force) {
        const isPlaying = await isListPlaying(VMIX_NAMES.VTS_LIST);
        if (isPlaying) {
          return {
            ok: false,
            reason: "alreadyPlaying",
          };
        }
      }

      const rundown = await serverAPI().rundowns.get.query({
        id: input.rundownID,
      });
      invariant(rundown, "Rundown not found");
      const media = rundown.items
        .sort((a, b) => a.order - b.order)
        .map((i) => i.media)
        .filter((x) => x && x.state === "Ready");
      const localMedia = getLocalMedia();
      const paths = media.map(
        (remote) =>
          localMedia.find((local) => local.mediaID === remote?.id)?.path,
      );
      if (paths.some((x) => !x)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Not all media is downloaded locally",
        });
      }
      await reconcileList(VMIX_NAMES.VTS_LIST, paths as string[]);
      return {
        ok: true,
      };
    }),
  loadSingleRundownVT: proc
    .input(
      z.object({
        rundownId: z.number(),
        itemId: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      const rundown = await serverAPI().rundowns.get.query({
        id: input.rundownId,
      });
      invariant(rundown, "Rundown not found");
      const item = rundown.items.find((x) => x.id === input.itemId);
      invariant(item, "Item not found");
      if (!item.media || item.media.state !== "Ready") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Media not ready",
        });
      }
      const localMedia = getLocalMedia();
      const path = localMedia.find((x) => x.mediaID === item.media!.id)?.path;
      invariant(path, "Local path not found for media " + item.media!.id);
      await addSingleItemToList(VMIX_NAMES.VTS_LIST, path);
    }),
  loadAssets: proc
    .input(
      z.union([
        z.object({
          rundownID: z.number(),
          assetID: z.number(),
        }),
        z.object({
          rundownID: z.number(),
          category: z.string(),
          loadType: z.enum(["direct", "list"]),
        }),
      ]),
    )
    .mutation(async ({ input }) => {
      const rundown = await serverAPI().rundowns.get.query({
        id: input.rundownID,
      });
      invariant(rundown, "Rundown not found");
      if ("category" in input) {
        const assets = rundown.assets.filter(
          (x) => x.category === input.category,
        );
        await loadAssets(assets, input.loadType, input.category);
      } else {
        const asset = rundown.assets.find((x) => x.id === input.assetID);
        invariant(asset, "Asset not found");
        await loadAssets([asset], "direct", asset.category);
      }
    }),
});
