import { Parser, Builder } from "xml2js";
import xpath from "xml2js-xpath";
import { InputProps, VMixState } from "./vmixTypes";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as net from "node:net";
import makeDebug from "debug";
import QueryString, { ParsedQs } from "qs";
import { produce } from "immer";

const debug = makeDebug("vmix");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function invariant(cond: any, msg: string): asserts cond {
  if (!cond) {
    throw new Error(`MockVMix: Invariant violation: ${msg}`);
  }
}

const xmlParser = new Parser();
const xmlBuilder = new Builder();

type StateRecipeFn = (s: VMixState) => VMixState | void;
type FunctionHandler = (
  state: VMixState,
  setState: (recipe: StateRecipeFn) => void,
  args: Record<string, string>,
) => string | { _error: string };
type FunctionHandlers = { [fn: string]: FunctionHandler };

class MockVMix {
  private _state: VMixState;
  private _server: net.Server | null = null;
  private _handlers: FunctionHandlers;

  private constructor(initialState: VMixState, handlers: FunctionHandlers) {
    this._state = initialState;
    this._handlers = handlers;
  }

  private async handleRequest(socket: net.Socket, request: string) {
    debug(`received request "%s"`, request.trim());
    const chunks = request.trim().split(" ");
    invariant(chunks.length >= 1, "nonsense request");
    const kind = chunks[0];
    switch (kind) {
      case "XML":
        return this.handleXML(socket);
      case "XMLTEXT":
        invariant(chunks.length === 2, "XMLTEXT no argument");
        return this.handleXMLText(socket, chunks[1].trim());
      case "FUNCTION":
        invariant(chunks.length !== 3, "FUNCTION no arguments");
        return this.handleFunction(socket, chunks[1], chunks[2]);
      default:
        invariant(false, `unknown request ${kind}`);
    }
  }

  handleXML(socket: net.Socket) {
    const payload = xmlBuilder.buildObject(this._state);
    socket.write(`XML ${payload.length}\r\n${payload}`);
  }

  handleXMLText(socket: net.Socket, query: string) {
    const result = xpath.find(this._state, query);
    const payload = xmlBuilder.buildObject(result);
    socket.write(`XMLTEXT ${payload.length}\r\n${payload}`);
  }

  handleFunction(socket: net.Socket, fn: string, argsQS: string) {
    const args = QueryString.parse(argsQS);
    const handler = this._handlers[fn];
    if (!handler) {
      socket.write(`FUNCTION ER no handler for ${fn}\r\n`);
      return;
    }
    const setState = (fn: StateRecipeFn) => {
      this._state = produce(fn)(this._state);
    };
    const result = handler(
      this._state,
      setState,
      // Technically you can have other stuff such as arrays, but in VMix this never happens, so we cheat
      // to simplify handler code.
      args as Record<string, string>,
    );
    if (typeof result === "object" && result._error) {
      socket.write(`FUNCTION ER ${result._error}\r\n`);
    } else {
      socket.write(`FUNCTION OK ${result}\r\n`);
    }
  }

  private createServer(port: number) {
    this._server = net.createServer((socket) => {
      debug(
        "received connection from %s:%d",
        socket.remoteAddress,
        socket.remotePort,
      );
      let buffer = "";
      socket.on("data", async (data) => {
        buffer += typeof data === "string" ? data : data.toString("utf-8");
        if (buffer.endsWith("\r\n")) {
          try {
            await this.handleRequest(socket, buffer);
          } catch (e) {
            debug("error handling request: %o", e);
          }
          buffer = "";
        }
      });
      socket.on("end", () => {
        debug("goodbye %s:%d", socket.remoteAddress, socket.remotePort);
      });
    });
    this._server.listen(port, "127.0.0.1", () => {
      debug("listening on port %d", port);
    });
  }

  static async create(
    port: number = 8099,
    initialState?: VMixState,
    handlers: FunctionHandlers = DEFAULT_HANDLERS,
  ) {
    if (!initialState) {
      initialState = await xmlParser.parseStringPromise(
        await fsp.readFile(
          path.join(import.meta.dirname, "__testdata__", "vmix.xml"),
        ),
      );
      invariant(initialState, "failed to parse testdata as initial state");
    }
    invariant(initialState, "no initial state");
    const r = new this(initialState, handlers);
    r.createServer(port);
    return r;
  }
}

const DEFAULT_HANDLERS: FunctionHandlers = {
  AddInput: (state, setState, args) => {
    const { Input, Value } = args;
    const [type, filePath] = Value.split("|");
    setState((state) => {
      state.vmix.inputs[0].input.push({
        _: filePath,
        $: {
          key: Input,
          number: (state.vmix.inputs[0].input.length + 1).toString(),
          type: type as InputProps["type"],
          title: filePath,
          shortTitle: path.basename(filePath),
          state: "Paused",
          position: "0",
          duration: "0",
          loop: "False",
          muted: "False",
          volume: "100",
          balance: "0",
          solo: "False",
          audiobusses: "M",
          meterF1: "0",
          meterF2: "0",
          gainDb: "0",
        } as InputProps,
      });
    });
    return "Done";
  },
};

if (process.argv[1] === import.meta.filename) {
  makeDebug.enable("vmix");
  await MockVMix.create();
}
