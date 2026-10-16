export class NativeProtocolError extends Error {
  constructor(){super('Unsupported native wire protocol; this service supports version 1');}
}
/** Opt-in adaptation preserves the existing Web protocol byte shape. */
export function nativeProtocol(header:string|string[]|undefined):boolean {
  if(header===undefined)return false;
  if(header!=='1')throw new NativeProtocolError();
  return true;
}
export function nativeSnapshot<T extends object>(snapshot:T,native:boolean):T|T&{schemaVersion:1}{
  return native?{...snapshot,schemaVersion:1 as const}:snapshot;
}
