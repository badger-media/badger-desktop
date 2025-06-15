import { Parser, Builder } from "xml2js";
import xpath from "xml2js-xpath";
import { InputProps, VMixState } from "./vmixTypes";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as net from "node:net";
import * as http from "node:http";
import makeDebug from "debug";
import QueryString from "qs";
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

class VMixFunctionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VMixFunctionError";
  }
}

type StateRecipeFn = (s: VMixState) => VMixState | void;
type FunctionHandler = (
  state: VMixState,
  setState: (recipe: StateRecipeFn) => void,
  args: Record<string, string>,
) => string | { _error: string };
type FunctionHandlers = { [fn: string]: FunctionHandler };

class MockVMix {
  private _state: VMixState;
  private _handlers: FunctionHandlers;

  private constructor(initialState: VMixState, handlers: FunctionHandlers) {
    this._state = initialState;
    this._handlers = handlers;
  }

  private handleRequestTCP(socket: net.Socket, request: string) {
    debug(`received request "%s"`, request.trim());
    const chunks = request.trim().split(" ");
    invariant(chunks.length >= 1, "nonsense request");
    const kind = chunks[0];
    switch (kind) {
      case "XML": {
        const xml = this.handleXML();
        socket.write(`XML ${xml.length}\r\n${xml}`);
        break;
      }
      case "XMLTEXT": {
        invariant(chunks.length === 2, "XMLTEXT no argument");
        const xml = this.handleXMLText(chunks[1].trim());
        socket.write(`XMLTEXT ${xml.length}\r\n${xml}`);
        break;
      }
      case "FUNCTION":
        invariant(chunks.length === 3, "FUNCTION no arguments");
        socket.write(`FUNCTION ${this.handleFunction(chunks[1], chunks[2])}`);
        break;
      default:
        invariant(false, `unknown request ${kind}`);
    }
  }

  private handleRequestHTTP(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) {
    debug("HTTP %s", req.url);
    const url = new URL(req.url!, "http://localhost:8088");
    if (url.pathname.toLowerCase().startsWith("/api")) {
      const fn = url.searchParams.get("Function")!;
      const result = this.handleFunction(fn, url.search);
      res.statusCode = result.startsWith("ER") ? 500 : 200;
      res.setHeader("Content-Type", "text/plain").end(result);
    } else {
      res.setHeader("Content-Type", "application/xml").end(this.handleXML());
    }
  }

  handleXML() {
    return xmlBuilder.buildObject(this._state);
  }

  handleXMLText(query: string) {
    const result = xpath.find(this._state, query);
    return xmlBuilder.buildObject(result);
  }

  handleFunction(fn: string, argsQS: string) {
    const args = QueryString.parse(argsQS);
    const handler = this._handlers[fn];
    if (!handler) {
      return `ER no handler for ${fn}\r\n`;
    }
    const setState = (fn: StateRecipeFn) => {
      this._state = produce(fn)(this._state);
    };
    let result;
    try {
      result = handler(
        this._state,
        setState,
        // Technically you can have other stuff such as arrays, but in VMix this never happens, so we cheat
        // to simplify handler code.
        args as Record<string, string>,
      );
    } catch (e) {
      if (e instanceof VMixFunctionError) {
        return `ER ${e.message}\r\n`;
      } else {
        throw e;
      }
    }
    if (typeof result === "object" && result._error) {
      return `ER ${result._error}\r\n`;
    } else {
      return `OK ${result}\r\n`;
    }
  }

  private createTCPServer(port: number) {
    const server = net.createServer((socket) => {
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
            this.handleRequestTCP(socket, buffer);
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
    server.listen(port, "127.0.0.1", () => {
      debug("TCP listening on port %d", port);
    });
  }

  private createHTTPServer(port: number) {
    const server = http.createServer(this.handleRequestHTTP.bind(this));
    server.listen(port, "127.0.0.1", () => {
      debug("HTTP listening on port %d", port);
    });
  }

  static async create(
    options: {
      tcpPort?: number;
      httpPort?: number;
      initialState?: VMixState;
      handlers?: FunctionHandlers;
    } = {},
  ) {
    if (!options.initialState) {
      options.initialState = await xmlParser.parseStringPromise(
        await fsp.readFile(
          path.join(import.meta.dirname, "__testdata__", "vmix.xml"),
        ),
      );
      invariant(
        options.initialState,
        "failed to parse testdata as initial state",
      );
    }
    invariant(options.initialState, "no initial state");
    if (!options.handlers) {
      options.handlers = DEFAULT_HANDLERS;
    }
    const r = new this(options.initialState, options.handlers);
    if (options.tcpPort) {
      r.createTCPServer(options.tcpPort);
    }
    if (options.httpPort) {
      r.createHTTPServer(options.httpPort);
    }
    return r;
  }
}

const DEFAULT_HANDLERS: FunctionHandlers = {
  AddInput: (_, setState, args) => {
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
  ListRemoveAll: (_, setState, args) => {
    const { Input } = args;
    setState((state) => {
      const list = state.vmix.inputs[0].input.find((x) => x.$.key === Input);
      if (!list) {
        throw new VMixFunctionError("no such list");
      }
      list.list![0].item = [];
    });
    return "Done";
  },
  ListAdd: (_, setState, args) => {
    const { Input, Value } = args;
    setState((state) => {
      const list = state.vmix.inputs[0].input.find((x) => x.$.key === Input);
      if (!list) {
        throw new VMixFunctionError("no such list");
      }
      list.list![0].item.push({
        _: Value,
        $: {
          selected: "false",
        },
      });
    });
    return "Done";
  },
};

if (process.argv[1] === import.meta.filename) {
  makeDebug.enable("vmix");
  await MockVMix.create({
    tcpPort: 8099,
    httpPort: 8088,
  });
}
