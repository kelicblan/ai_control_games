import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { cancelAfterFirstChunk } from '../scripts/unity/process-smoke-utils.mjs';

for (const mode of ['no-headers', 'headers-without-body']) test(`native smoke bounds ${mode}`, { timeout: 3000 }, async t => {
  const server = http.createServer((_request, response) => {
    if (mode === 'headers-without-body') { response.writeHead(200, { 'Content-Type': 'text/event-stream' }); response.flushHeaders(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const started = Date.now();
  await assert.rejects(cancelAfterFirstChunk(`http://127.0.0.1:${server.address().port}/completion`, { headers: {}, body: '{}', timeoutMs: 100 }), /deadline/i);
  assert.ok(Date.now() - started < 2000);
});

test('native smoke cancels a genuinely streaming request after its first chunk', { timeout: 3000 }, async t => {
  let closed;
  const socketClosed = new Promise(resolve => { closed = resolve; });
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' }); response.write('data: {"content":"1"}\n\n');
    response.once('close', closed);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  await cancelAfterFirstChunk(`http://127.0.0.1:${server.address().port}/completion`, { headers: {}, body: '{}', timeoutMs: 1000 });
  await socketClosed;
});

test('test launcher kills its own child when output setup fails after process start', { timeout: 15000 }, () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'campmind-process-cleanup-'));
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  try {
    const script = `
      $ErrorActionPreference='Stop'
      . ${quote(path.resolve('scripts/unity/process.ps1'))}
      $start=[System.Diagnostics.ProcessStartInfo]::new()
      $start.FileName=(Get-Process -Id $PID).Path
      $start.ArgumentList.Add('-NoProfile')
      $start.ArgumentList.Add('-Command')
      $start.ArgumentList.Add('Start-Sleep -Seconds 60')
      $start.UseShellExecute=$false
      $start.CreateNoWindow=$true
      $start.RedirectStandardOutput=$false
      $start.RedirectStandardError=$true
      try { Invoke-CampMindTestProcess -StartInfo $start -RunDirectory ${quote(directory)} -TimeoutSeconds 5; exit 9 }
      catch {
        $record=Get-Content -LiteralPath ${quote(path.join(directory, 'process.json'))} -Raw | ConvertFrom-Json
        if (Get-Process -Id $record.pid -ErrorAction SilentlyContinue) { exit 8 }
        Write-Output 'owned-child-reaped'
        exit 0
      }
    `;
    const result = spawnSync('pwsh', ['-NoProfile', '-Command', script], { encoding: 'utf8', timeout: 12000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /owned-child-reaped/);
    assert.ok(JSON.parse(readFileSync(path.join(directory, 'process.json'), 'utf8')).pid > 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Editor port guard reserves loopback during its child and releases it afterwards', { timeout: 15000 }, async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'campmind-port-guard-'));
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  try {
    const childCode = `$listener=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,${port}); try{$listener.Start();$listener.Stop();exit 9}catch [System.Net.Sockets.SocketException]{exit 0}`;
    const code = `
      $ErrorActionPreference='Stop'
      . ${quote(path.resolve('scripts/unity/process.ps1'))}
      $start=[System.Diagnostics.ProcessStartInfo]::new()
      $start.FileName=(Get-Process -Id $PID).Path
      $start.ArgumentList.Add('-NoProfile');$start.ArgumentList.Add('-Command');$start.ArgumentList.Add(${quote(childCode)})
      $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
      $code=Invoke-CampMindTestProcess -StartInfo $start -RunDirectory ${quote(directory)} -TimeoutSeconds 5 -GuardBuildReportPort -BuildReportPort ${port}
      exit $code
    `;
    const result = spawnSync('pwsh', ['-NoProfile', '-Command', code], { encoding: 'utf8', timeout: 12000 });
    assert.equal(result.status, 0, result.stderr);
    for (const host of ['127.0.0.1', '::1']) {
      const server = net.createServer();
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen({ host, port, ipv6Only: host === '::1' }, resolve); });
      await new Promise(resolve => server.close(resolve));
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
