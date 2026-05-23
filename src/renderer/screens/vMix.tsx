import { Button } from "@/renderer/components/button";
import { useMemo, useState } from "react";
import invariant from "../../common/invariant";
import { Alert } from "@/renderer/components/alert";
import { Progress } from "@/renderer/components/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/renderer/components/table";
import { Badge } from "@/renderer/components/badge";
import { Label } from "@/renderer/components/label";
import { Input } from "@/renderer/components/input";
import {
  IoCheckmarkDone,
  IoChevronDown,
  IoChevronForward,
  IoDownload,
  IoPush,
} from "react-icons/io5";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/renderer/components/dropdown-menu";
import { DropdownMenuItem } from "@radix-ui/react-dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/renderer/components/alert-dialog";
import { dispatch, useAppSelector } from "../store";
import {
  CompleteAssetModel,
  CompleteRundownType,
  RundownItem,
} from "@/types/serverAPILenses";

export function VMixConnection() {
  const state = useAppSelector((state) => state.vmix.connection);

  return (
    <div>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const values = new FormData(e.currentTarget);
          dispatch.connectToVMix({
            host: values.get("host") as string,
            port: parseInt(values.get("port") as string),
          });
        }}
      >
        <div>
          <Label htmlFor="host">vMix Host</Label>
          <Input id="host" name="host" type="text" defaultValue={state.host} />
        </div>
        <div>
          <Label htmlFor="port">vMix Port</Label>
          <Input
            id="port"
            name="port"
            type="number"
            defaultValue={state.port}
          />
        </div>
        <Button type="submit" color={state.connected ? "ghost" : "primary"}>
          Connect
        </Button>
        {state.error && (
          <div className="bg-danger-4 text-light">{state.error}</div>
        )}
        {state.connected && (
          <Alert>
            Connected to vMix {state.edition} v{state.version}
          </Alert>
        )}
      </form>
    </div>
  );
}

type ItemState =
  | "no-media"
  | "archived"
  | "media-processing"
  | "no-local"
  | "downloading"
  | "download-error"
  | "ready"
  | "loaded";

interface UIItem extends RundownItem {
  _state: ItemState;
  _downloadProgress?: number;
}

function RundownVTs(props: { rundown: CompleteRundownType }) {
  const localMedia = useAppSelector((state) => state.localMedia.media);
  const downloadState = useAppSelector((state) =>
    state.localMedia.currentDownload
      ? [state.localMedia.currentDownload, ...state.localMedia.downloadQueue]
      : state.localMedia.downloadQueue,
  );
  const vmixLoaded = useAppSelector((state) => state.vmix.loadedVTIDs);

  const items: Array<UIItem> = useMemo(() => {
    // TODO: Refactor this into main-side state computed by reducer
    return props.rundown.items
      .filter((item) => item.type !== "Segment")
      .sort((a, b) => a.order - b.order)
      .map((item) => {
        if (!item.media) {
          return {
            ...item,
            _state: "no-media",
          };
        }
        // Special-case archived
        if (item.media.state === "Archived") {
          return {
            ...item,
            _state: "archived",
          };
        }
        if (item.media.state !== "Ready") {
          return {
            ...item,
            _state: "media-processing",
          };
        }
        const local = localMedia.find((x) => x.mediaID === item.media!.id);
        if (!local) {
          const dl = downloadState.find((x) => x.mediaID === item.media!.id);
          if (dl) {
            switch (dl.status) {
              case "downloading":
                return {
                  ...item,
                  _state: "downloading",
                  _downloadProgress: dl.progressPercent,
                };
              case "pending":
                return {
                  ...item,
                  _state: "downloading",
                  _downloadProgress: 0,
                };
              case "error":
                return {
                  ...item,
                  _state: "download-error",
                };
              case "done":
                // This should advance into "ready" as soon as the localMedia query
                // updates, but for now it'll get stuck as no-local, which is undesirable.
                return {
                  ...item,
                  _state: "downloading",
                  _downloadProgress: 100,
                };
            }
          }
          return {
            ...item,
            _state: "no-local",
          };
        }
        if (vmixLoaded.find((x) => x === local.mediaID)) {
          return {
            ...item,
            _state: "loaded",
          };
        }
        return {
          ...item,
          _state: "ready",
        };
      });
  }, [downloadState, localMedia, props.rundown.items, vmixLoaded]);

  return (
    <>
      <h2 className="text-xl font-light">VTs</h2>
      <Table>
        <colgroup>
          <col />
          <col style={{ width: "12rem" }} />
        </colgroup>
        <TableBody>
          {items.map((item) => (
            <ItemRow key={item.id} rundown={props.rundown} item={item} />
          ))}
          <TableRow>
            <TableCell />
            <TableCell>
              <LoadAll rundown={props.rundown} items={items} />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </>
  );
}

function LoadAll(props: {
  rundown: CompleteRundownType;
  items: Array<UIItem>;
}) {
  const isItemLoading = useAppSelector((state) => state.vmix.isLoading);

  const [isAlreadyLoadedDialogOpen, setAlreadyLoadedDialogOpen] =
    useState(false);
  return (
    <>
      <Button
        disabled={isItemLoading}
        onClick={async () => {
          const result = await dispatch.loadAllVTs({
            rundownID: props.rundown.id,
          });
          if (result.type === "vmix/loadAllVTs/fulfilled") {
            const payload = result.payload as { ok: boolean; reason: string };
            if (!payload.ok) {
              switch (payload.reason) {
                case "alreadyPlaying":
                  setAlreadyLoadedDialogOpen(true);
                  break;
                default:
                  invariant(
                    false,
                    `unexpected loadAllVTs failure reason ${payload.reason}`,
                  );
              }
            }
          }
        }}
        className="w-full"
        color={
          props.items.some((x) => x._state === "ready") ? "primary" : "ghost"
        }
      >
        Load All <span className="sr-only">VTs</span>
      </Button>
      <AlertDialog open={isAlreadyLoadedDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>VTs Currently Playing</AlertDialogTitle>
            <AlertDialogDescription>
              VTs are currently playing. Loading them may interrupt playback.
              Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                dispatch.loadAllVTs({
                  rundownID: props.rundown.id,
                  force: true,
                });
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ItemRow({
  rundown,
  item,
}: {
  rundown: CompleteRundownType;
  item: UIItem;
}) {
  const [isPromptLoadSingleOpen, setPromptLoadSingleOpen] = useState(false);
  const isItemLoading = useAppSelector((state) => state.vmix.isLoading);

  return (
    <>
      <TableRow key={item.id}>
        <TableCell className="text-lg">{item.name}</TableCell>
        <TableCell>
          {item._state === "no-media" && (
            <Badge variant="dark" className="w-full">
              No media uploaded
            </Badge>
          )}
          {item._state === "media-processing" && (
            <Badge variant="purple" className="w-full">
              Processing on server
            </Badge>
          )}
          {item._state === "archived" && (
            <Badge variant="dark" className="w-full">
              Archived on server
            </Badge>
          )}
          {item._state === "downloading" && (
            <Progress value={item._downloadProgress} className="w-16" />
          )}
          {item._state === "download-error" && (
            <>
              <Badge variant="danger" className="w-full">
                Download error!
              </Badge>
            </>
          )}
          {(item._state === "no-local" || item._state === "download-error") && (
            <Button
              color="primary"
              className="w-full"
              onClick={async () => {
                invariant(
                  item.media,
                  "no media for item in download button handler",
                );
                dispatch.queueMediaDownload({ mediaID: item.media.id });
              }}
            >
              {item._state === "no-local" ? "Download" : "Retry"}
            </Button>
          )}
          {item._state === "ready" && (
            <Button
              color="default"
              className="w-full"
              onClick={() => setPromptLoadSingleOpen(true)}
            >
              Ready for load
            </Button>
          )}
          {item._state === "loaded" && (
            <Badge variant="outline" className="w-full">
              Good to go!
            </Badge>
          )}
        </TableCell>
      </TableRow>

      <AlertDialog
        open={isPromptLoadSingleOpen}
        onOpenChange={setPromptLoadSingleOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Load {item.name}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to load {item.name}? This may load it in the
              wrong order. To load all the VTs in the correct order, click "Load
              All" instead.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isItemLoading}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isItemLoading}
              onClick={(e) => {
                e.preventDefault();
                dispatch
                  .loadSingleVT({
                    rundownID: rundown.id,
                    itemID: item.id,
                  })
                  .then(() => {
                    setPromptLoadSingleOpen(false);
                  });
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface AssetState {
  state:
    | "no-media"
    | "downloading"
    | "no-local"
    | "processing"
    | "processing-failed"
    | "ready";
  downloadProgress?: number;
}

function SingleAsset({
  asset,
  state,
  rundown,
}: {
  asset: CompleteAssetModel;
  state: AssetState;
  rundown: CompleteRundownType;
}) {
  return (
    <TableRow>
      <TableCell className="text-lg align-middle h-full">
        {asset.name}
      </TableCell>
      <TableCell className="flex justify-center flex-col">
        {state.state === "no-media" && (
          <span className="text-warning-4">No media!</span>
        )}
        {state.state === "processing" && (
          <span className="text-primary-4">Processing on server</span>
        )}
        {state.state === "processing-failed" && (
          <span className="text-warning-4">Processing failed on server!</span>
        )}
        {state.state === "downloading" && (
          <Progress value={state.downloadProgress} />
        )}
        {state.state === "no-local" && (
          <Button
            color="primary"
            onClick={async () => {
              invariant(
                asset.media,
                "no media for asset in download button handler",
              );
              dispatch.queueMediaDownload({ mediaID: asset.media.id });
            }}
            className="w-full"
          >
            Download
          </Button>
        )}
        {state.state === "ready" && (
          <Button
            onClick={() =>
              dispatch.loadAssets({
                rundownID: rundown.id,
                assetID: asset.id,
              })
            }
            color="primary"
            className="w-full"
          >
            Load
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function AssetCategory(props: {
  category: string;
  assets: CompleteAssetModel[];
  rundown: CompleteRundownType;
}) {
  const [isExpanded, setExpanded] = useState(false);

  const downloadState = useAppSelector((state) =>
    state.localMedia.currentDownload
      ? [state.localMedia.currentDownload, ...state.localMedia.downloadQueue]
      : state.localMedia.downloadQueue,
  );
  const localMedia = useAppSelector((state) => state.localMedia.media);

  // Just so there's *some* feedback - determining it from vMix is unreliable
  // as we don't know how it'll be loaded
  const [didLoad, setDidLoad] = useState(false);

  function getAssetState(asset: CompleteAssetModel): AssetState {
    if (!asset.media) {
      return { state: "no-media" };
    }
    if (asset.media.state === "Archived") {
      return { state: "no-media" };
    }
    if (asset.media.state === "Processing") {
      return { state: "processing" };
    }
    if (asset.media.state === "ProcessingFailed") {
      return { state: "processing-failed" };
    }
    if (asset.media.state !== "Ready") {
      return { state: "no-media" };
    }

    const local = localMedia.find((x) => x.mediaID === asset.media!.id);
    if (!local) {
      const dl = downloadState.find((x) => x.mediaID === asset.media!.id);
      if (dl) {
        switch (dl.status) {
          case "downloading":
            return {
              state: "downloading",
              downloadProgress: dl.progressPercent,
            };
          case "pending":
            return { state: "downloading" };
          case "error":
            return { state: "no-local" };
          case "done":
            return { state: "downloading", downloadProgress: 100 };
        }
      }
      return { state: "no-local" };
    }

    return { state: "ready" };
  }

  const someNeedDownload = props.assets.some(
    (asset) => getAssetState(asset).state === "no-local",
  );

  return (
    <div>
      <div className="px-2 w-full flex items-start justify-center">
        <Button
          size="icon"
          color="ghost"
          onClick={() => setExpanded((v) => !v)}
          title="Expand"
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${props.category}`}
        >
          {isExpanded ? <IoChevronDown /> : <IoChevronForward />}
        </Button>
        <div className="self-stretch flex items-center justify-center align-middle">
          <h3>{props.category}</h3>
        </div>
        <div className="grow">{/* spacer */}</div>
        {someNeedDownload && (
          <Button
            size="icon"
            color="ghost"
            title="Download All"
            aria-label={`Download All Media in ${props.category}`}
            onClick={() => {
              for (const asset of props.assets) {
                if (getAssetState(asset).state === "no-media") {
                  continue;
                }
                if (getAssetState(asset).state === "no-local") {
                  dispatch.queueMediaDownload({ mediaID: asset.media!.id });
                }
              }
            }}
          >
            <IoDownload size="sm" />
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              color="ghost"
              title="Load All"
              aria-label={`Load All Media in ${props.category}`}
            >
              {didLoad ? (
                <IoCheckmarkDone data-testid="Load Success" />
              ) : (
                <IoPush size="sm" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onClick={() =>
                dispatch
                  .loadAssets({
                    rundownID: props.rundown.id,
                    category: props.category,
                    loadType: "list",
                  })
                  .then(() => setDidLoad(true))
              }
            >
              In List
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                dispatch
                  .loadAssets({
                    rundownID: props.rundown.id,
                    category: props.category,
                    loadType: "direct",
                  })
                  .then(() => setDidLoad(true))
              }
            >
              As separate inputs
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {isExpanded && (
        <Table className="space-y-2">
          <colgroup>
            <col />
            <col style={{ width: "12rem" }} />
          </colgroup>
          <TableBody>
            {props.assets.map((asset) => (
              <SingleAsset
                key={asset.id}
                asset={asset}
                state={getAssetState(asset)}
                rundown={props.rundown}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function RundownAssets(props: { rundown: CompleteRundownType }) {
  const assets: Map<string, CompleteAssetModel[]> = useMemo(() => {
    const byCategory = new Map();
    for (const asset of props.rundown.assets) {
      if (!byCategory.has(asset.category)) {
        byCategory.set(asset.category, []);
      }
      byCategory.get(asset.category)!.push(asset);
    }
    return byCategory;
  }, [props.rundown.assets]);

  return (
    <>
      <h2 className="text-xl font-light">Assets</h2>
      {Array.from(assets.entries()).map(([category, assets]) => (
        <AssetCategory
          key={category}
          category={category}
          assets={assets}
          rundown={props.rundown}
        />
      ))}
    </>
  );
}

function Rundown(props: { rundown: CompleteRundownType }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl">{props.rundown.name}</h1>
      <RundownVTs rundown={props.rundown} />
      <RundownAssets rundown={props.rundown} />
    </div>
  );
}

export default function VMixScreen(props: { rundown: CompleteRundownType }) {
  const connectionState = useAppSelector((state) => state.vmix.connection);

  if (!connectionState.connected) {
    return (
      <Alert variant="danger">
        Not connected to vMix. Please ensure vMix is running and the TCP API is
        enabled.
      </Alert>
    );
  }
  return <Rundown rundown={props.rundown} />;
}
