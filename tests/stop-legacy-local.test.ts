import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { expect, it } from 'vitest';

it.skipIf(process.platform !== 'win32').each([false,true])('legacy stop verifies both owners before stopping anything (foreign=%s)',foreign=>{
  const root=process.cwd().replace(/'/g,"''"),script=path.join(process.cwd(),'scripts/stop-legacy-local.ps1').replace(/'/g,"''");
  // Shadow all process mutation/inspection cmdlets in an isolated shell. No live service is touched.
  const code=`
$global:stopped=@()
function Get-NetTCPConnection { param($State,$LocalPort) [PSCustomObject]@{OwningProcess=$LocalPort} }
function Get-CimInstance { param($ClassName,$Filter)
 if($Filter -match '5173') { [PSCustomObject]@{Name='node.exe';CommandLine='node "${root}\\node_modules\\vite\\bin\\vite.js"'} }
 else { [PSCustomObject]@{Name='node.exe';CommandLine='node --import tsx scripts/world/server.ts'} }
}
function Invoke-RestMethod { param($Uri,$TimeoutSec) [PSCustomObject]@{service='campmind-world-v1';root='${foreign?'C:\\unrelated-project':root}'} }
function Stop-Process { param($Id) $global:stopped+= $Id }
$failed=$false
try { & '${script}' } catch { $failed=$true }
if($failed -ne $${foreign?'true':'false'}) { throw 'Unexpected ownership result' }
if($global:stopped.Count -ne ${foreign?0:2}) { throw 'Incorrect stop count' }
Write-Output 'Ownership checks passed'
`;
  const result=spawnSync('powershell.exe',['-NoProfile','-Command',code],{encoding:'utf8',windowsHide:true,timeout:10000});
  expect(result.status,result.stderr+result.stdout).toBe(0);
  expect(result.stdout).toContain('Ownership checks passed');
});
