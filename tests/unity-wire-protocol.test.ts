import { describe, expect, it } from 'vitest';
import { nativeProtocol, nativeSnapshot, NativeProtocolError } from '../scripts/world/native-protocol';

describe('versioned native wire adaptation',()=>{
  it('preserves existing Web responses and explicitly versions native snapshots',()=>{
    const snapshot={revision:4,state:null};
    expect(nativeProtocol(undefined)).toBe(false);expect(nativeSnapshot(snapshot,false)).toBe(snapshot);
    expect(nativeProtocol('1')).toBe(true);expect(nativeSnapshot(snapshot,true)).toEqual({schemaVersion:1,revision:4,state:null});
  });
  it('rejects unknown and ambiguous versions before world mutation',()=>{
    for(const version of ['0','2','1, 2',['1','2']])expect(()=>nativeProtocol(version)).toThrow(NativeProtocolError);
  });
});
