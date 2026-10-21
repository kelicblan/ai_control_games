import { sha256HexFallback } from './sha256';
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  throw new Error('Expected finite JSON data');
}
export const digest = (value: unknown) => sha256HexFallback(new TextEncoder().encode(canonical(value)));
export function ensure(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
/** Same value domain as canonical(), without sorting or allocating a full serialized snapshot. */
export function assertFiniteJson(value:unknown,ancestors=new Set<object>()):void{
  if(value===null||typeof value==='string'||typeof value==='boolean')return;
  if(typeof value==='number'){ensure(Number.isFinite(value),'Expected finite JSON data');return;}
  ensure(Array.isArray(value)||record(value),'Expected finite JSON data');
  ensure(!ancestors.has(value)&&ancestors.size<256,'Cyclic or too deep JSON data');ancestors.add(value);
  if(Array.isArray(value))for(const child of value)assertFiniteJson(child,ancestors);else for(const key of Object.keys(value))assertFiniteJson(value[key],ancestors);
  ancestors.delete(value);
}
/** Copy the runtime's finite-JSON value domain while preserving shared references and rollback isolation. */
export function copyFiniteJson<T>(value:T):T{
  const copies=new Map<object,unknown>(),ancestors=new Set<object>();
  function copy(input:unknown,depth:number):unknown{
    if(input===null||typeof input==='string'||typeof input==='boolean')return input;
    if(typeof input==='number'){ensure(Number.isFinite(input),'Expected finite JSON data');return input;}
    ensure(input&&typeof input==='object'&&(Array.isArray(input)||Object.getPrototypeOf(input)===Object.prototype||Object.getPrototypeOf(input)===null),'Expected finite JSON data');
    ensure(!ancestors.has(input)&&depth<256,'Cyclic or too deep JSON data');
    if(copies.has(input))return copies.get(input);
    const result:Record<string,unknown>|unknown[]=Array.isArray(input)?[]:{};copies.set(input,result);ancestors.add(input);
    for(const key of Object.keys(input)){
      const descriptor=Object.getOwnPropertyDescriptor(input,key)!;ensure('value'in descriptor,'Expected JSON data properties');const child=copy(descriptor.value,depth+1);
      if(key==='__proto__')Object.defineProperty(result,key,{value:child,enumerable:true,writable:true,configurable:true});else (result as Record<string,unknown>)[key]=child;
    }
    ancestors.delete(input);return result;
  }
  return copy(value,0)as T;
}
