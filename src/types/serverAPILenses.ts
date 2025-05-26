import { API } from "./serverAPI";

export type CompleteRundownType = API["rundowns"]["get"]["_def"]["_output_out"];
export type RundownItem = CompleteRundownType["items"][number];

export type PartialShowModel =
  API["shows"]["listUpcoming"]["_def"]["_output_out"][number];
export type CompleteShowModel = API["shows"]["get"]["_def"]["_output_out"];

export type CompleteContinuityItemModel =
  API["shows"]["get"]["_def"]["_output_out"]["continuityItems"][number];
export type PartialContinuityItemModel = Omit<
  CompleteContinuityItemModel,
  "media"
>;

export type PartialMediaModel = NonNullable<
  CompleteContinuityItemModel["media"]
>;
export type CompleteMediaModel = API["media"]["get"]["_def"]["_output_out"];
export type CompleteAssetModel = CompleteRundownType["assets"][number];
