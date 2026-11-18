import "fake-indexeddb/auto";

/* jsdom's AbortSignal isn't Node's, and Node's Request (undici) rejects it —
 * react-router's data router builds a Request per navigation. Test-only shim. */
const NativeRequest = globalThis.Request;
if (NativeRequest) {
  globalThis.Request = class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      if (init && "signal" in init) {
        const { signal: _s, ...rest } = init;
        super(input, rest);
      } else super(input, init);
    }
  } as typeof Request;
}
