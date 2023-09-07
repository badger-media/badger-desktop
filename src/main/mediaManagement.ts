// noinspection ExceptionCaughtLocallyJS

import * as os from "node:os";
import { getMediaSettings, updateLocalMediaState } from "./settings";
import * as fsp from "fs/promises";
import * as path from "path";
import { serverApiClient } from "./serverApiClient";
import { z } from "zod";
import * as wget from "wget-improved";
import { IPCEvents } from "./ipcEventBus";

export async function getMediaPath(): Promise<string> {
  const settings = await getMediaSettings();
  if (settings) {
    return settings.mediaPath;
  }
  switch (os.platform()) {
    case "win32":
      return "C:\\bowser_media";
    case "darwin":
      return `${os.userInfo().homedir}/Movies/Bowser Media`;
    case "linux":
      return `${os.userInfo().homedir}/Videos/Bowser Media`;
    default:
      throw new Error("Unsupported platform");
  }
}

export async function ensureMediaPath(): Promise<string> {
  const mediaPath = await getMediaPath();
  await fsp.mkdir(mediaPath, { recursive: true });
  return mediaPath;
}

interface DownloadQueueItem {
  mediaID: number;
}

export const DownloadStatusSchema = z.object({
  mediaID: z.number(),
  name: z.string(),
  status: z.enum(["pending", "downloading", "done", "error"]),
  progressPercent: z.number().optional(),
  error: z.string().optional(),
});
type DownloadStatus = z.infer<typeof DownloadStatusSchema>;

const downloadQueue: DownloadQueueItem[] = [];
export const downloadStatus: Map<number, DownloadStatus> = new Map();
let isDownloadRunning = false;

async function doDownloadMedia() {
  if (isDownloadRunning) {
    return;
  }
  // this is JS, no atomicity needed!
  isDownloadRunning = true;
  try {
    const task = downloadQueue.shift();
    if (!task) {
      return;
    }
    if (!serverApiClient) {
      throw new Error("Server API client not initialized");
    }
    const info = await serverApiClient.media.get.query({ id: task.mediaID });
    const urlRaw = info.downloadURL;
    if (!urlRaw) {
      console.warn(
        `Requested to download media ${info.id} [${info.name}], but it did not have a download URL.`,
      );
      process.nextTick(doDownloadMedia);
      return;
    }

    // Transforms "foo.mp4" to "foo (#123).mp4"
    const extension = path.extname(info.name);
    const newFileName =
      info.name.slice(0, -extension.length) + ` (#${info.id})` + extension;
    const outputPath = path.join(await ensureMediaPath(), newFileName);
    console.log(
      `Starting to download media ${info.id} [${newFileName}] to ${outputPath}`,
    );
    const status: DownloadStatus = {
      mediaID: info.id,
      name: newFileName,
      status: "downloading",
      progressPercent: 0,
    };
    downloadStatus.set(info.id, status);
    IPCEvents.downloadStatusChange();

    try {
      const download = wget.download(urlRaw, outputPath, {
        // @ts-expect-error typings wrong, `download` does accept this
        gunzip: true,
      });

      download.on("progress", (progress: number) => {
        status.progressPercent = progress * 100;
        IPCEvents.downloadStatusChange();
      });
      await new Promise<void>((resolve, reject) => {
        download.on("error", reject);
        download.on("end", resolve);
      });
    } catch (e) {
      console.error(`Error downloading media ${info.id} [${newFileName}]`, e);
      status.status = "error";
      status.error = String(e);
      if (downloadQueue.length > 0) {
        process.nextTick(doDownloadMedia);
      }
      IPCEvents.downloadStatusChange();
      return;
    }

    console.log(
      `Downloaded media ${info.id} [${newFileName}] to ${outputPath}`,
    );
    status.status = "done";
    IPCEvents.downloadStatusChange();
    await updateLocalMediaState(info.id, {
      mediaID: info.id,
      path: outputPath,
    });

    if (downloadQueue.length > 0) {
      process.nextTick(doDownloadMedia);
    }
  } finally {
    isDownloadRunning = false;
  }
}

export function downloadMedia(mediaID: number, name?: string) {
  downloadQueue.push({ mediaID });
  downloadStatus.set(mediaID, {
    mediaID,
    // NB: This is technically untrusted data, as it's passed in from the renderer. However,
    // this is safe, as this is only used for display purposes - the actual file name is determined
    // (and this is overwritten) in doDownloadMedia after doing a server API fetch.
    name: name ?? "Unknown",
    status: "pending",
  });
  process.nextTick(doDownloadMedia);
}

export function getDownloadStatus() {
  return Array.from(downloadStatus.values());
}
