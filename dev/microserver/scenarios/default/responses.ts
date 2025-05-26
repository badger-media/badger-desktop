import { MICRO_SERVER_PORT, proc } from "../../lib";
import { add } from "date-fns";
import { z } from "zod";
import type { API as Real } from "../../../../src/types/serverAPI";
import { CompleteMediaModel, CompleteRundownType, CompleteShowModel, PartialShowModel } from "@/types/serverAPILenses";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJSON = require("../../../../package.json");

export const sampleRundown: CompleteRundownType = {
  id: 1,
  showId: 1,
  name: "Test Rundown",
  order: 1,
  items: [
    {
      id: 1,
      rundownId: 1,
      order: 0,
      name: "Test VT",
      type: "VT",
      durationSeconds: 15,
      media: null,
      mediaId: null,
      notes: "",
    },
  ],
  assets: [],
};

export const sampleShow: CompleteShowModel = {
  id: 1,
  name: "Test Show",
  start: add(new Date(), { days: 5 }),
  version: 5,
  continuityItems: [
    {
      id: 1,
      name: "Test Continuity",
      durationSeconds: 15,
      order: 0,
      media: null,
      mediaId: null,
      showId: 1,
    },
  ],
  rundowns: [sampleRundown],
};

export const testMedia: CompleteMediaModel = {
  id: 1,
  name: "smpte_bars_15s.mp4",
  path: "media/1/final/smpte_bars_15s.mp4",
  rawPath: "media/1/raw/smpte_bars_15s.mp4",
  downloadURL: `http://localhost:${MICRO_SERVER_PORT}/testMedia/smpte_bars_15s.mp4`,
  assets: [],
  continuityItems: [sampleShow.continuityItems[0]],
  durationSeconds: 15,
  rundownItems: [sampleRundown.items[0]],
  state: "Ready",
  tasks: [
    {
      additionalInfo: "",
      description: "Downloading source file",
      id: 1,
      media_id: 1,
      state: "Complete",
    },
    {
      additionalInfo: "",
      description: "Uploading source file to storage",
      id: 2,
      media_id: 1,
      state: "Complete",
    },
    {
      additionalInfo: "Duration: 0:15",
      description: "Determining duration",
      id: 3,
      media_id: 1,
      state: "Complete",
    },
    {
      additionalInfo: "",
      description: "Normalising loudness",
      id: 4,
      media_id: 1,
      state: "Complete",
    },
    {
      additionalInfo: "",
      description: "Uploading processed file",
      id: 5,
      media_id: 1,
      state: "Complete",
    },
  ],
};
sampleRundown.items[0].media = testMedia;
sampleRundown.items[0].mediaId = testMedia.id;
sampleShow.continuityItems[0].media = testMedia;
sampleShow.continuityItems[0].mediaId = testMedia.id;

const responses = {
  ping: proc.query(async () => {
    return {
      ping: "pong",
      version: packageJSON.version,
    };
  }) satisfies Real["ping"],
  "shows.listUpcoming": proc
    .input(
      z
        .object({
          gracePeriodHours: z.number().default(0),
        })
        .optional(),
    )
    .output(z.custom<PartialShowModel[]>())
    .query(async () => {
      return [sampleShow];
    }) satisfies Real["shows"]["listUpcoming"],
  "shows.get": proc
    .input(z.object({ id: z.number() }))
    .output(z.custom<CompleteShowModel>())
    .query(async ({ input }) => {
      if (input.id !== sampleShow.id) {
        throw new Error("Not found");
      }
      return sampleShow;
    }) satisfies Real["shows"]["get"],
  "shows.getVersion": proc
    .input(z.object({ id: z.number() }))
    .output(z.object({ version: z.number() }))
    .query(async ({ input }) => {
      if (input.id !== sampleShow.id) {
        throw new Error("Not found");
      }
      return { version: sampleShow.version };
    }) satisfies Real["shows"]["getVersion"],
  "media.get": proc
    .input(z.object({ id: z.number() }))
    .output(z.custom<CompleteMediaModel>())
    .query(async ({ input }) => {
      if (input.id !== testMedia.id) {
        throw new Error("Not found");
      }
      return testMedia;
    }) satisfies Real["media"]["get"],
  "media.bulkGet": proc
    .input(z.array(z.number()))
    .output(z.array(z.custom<CompleteMediaModel>()))
    .query(async ({ input }) => {
      if (!input.includes(testMedia.id)) {
        throw new Error("Not found");
      }
      return [
        {
          id: testMedia.id,
          name: testMedia.name,
          path: testMedia.path,
          rawPath: testMedia.rawPath,
          durationSeconds: testMedia.durationSeconds,
          state: "Ready",
          assets: [],
          continuityItems: [
            {
              ...sampleShow.continuityItems[0],
              show: sampleShow,
            },
          ],
          tasks: testMedia.tasks,
          rundownItems: [
            {
              ...sampleRundown.items[0],
              rundown: {
                ...sampleRundown,
                show: sampleShow,
              },
            },
          ],
        },
      ];
    }),
  "rundowns.get": proc
    .input(z.object({ id: z.number() }))
    .output(z.custom<CompleteRundownType>())
    .query(async ({ input }) => {
      if (input.id !== sampleRundown.id) {
        throw new Error("Not found");
      }
      return sampleRundown;
    }) satisfies Real["rundowns"]["get"],
};

export default responses;
