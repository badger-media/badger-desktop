/* eslint-disable @typescript-eslint/no-unused-vars */

import { CompleteShowModel } from "@/types/serverAPILenses";

/*
 * This file defines the events that can be sent from the main process to the renderer process.
 * To add a new event, add it to the Events object below. Then you can use IPCEvents.eventName to send
 * from the main process, and IPCEventBus.on("eventName") to receive in the renderer process.
 */

export const Events = {
  selectedShowChange(_newShow: CompleteShowModel | null) {},
  assetsSettingsChange() {},
  devToolsSettingsChange() {},
  downloadStatusChange() {},
  localMediaStateChange() {},
} as const;
export type Events = typeof Events;
