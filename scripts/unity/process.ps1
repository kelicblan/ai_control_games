#Requires -Version 7.2
Set-StrictMode -Version Latest

function Invoke-CampMindTestProcess {
    param(
        [Parameter(Mandatory)][System.Diagnostics.ProcessStartInfo]$StartInfo,
        [Parameter(Mandatory)][string]$RunDirectory,
        [ValidateRange(1, 7200)][int]$TimeoutSeconds = 600,
        [switch]$GuardBuildReportPort,
        [ValidateRange(1, 65535)][int]$BuildReportPort = 38000
    )
    $ownedProcess = $null
    $stdoutTask = $null
    $stderrTask = $null
    $listeners = [System.Collections.Generic.List[System.Net.Sockets.TcpListener]]::new()
    try {
        if ($GuardBuildReportPort) {
            # This optional Unity Editor REST service crashes in Mono socket init
            # on this VPN/TUN setup. Reserve only loopback for this child lifetime;
            # its native BuildReport API remains available. Never change VPN/routes.
            foreach ($address in @([System.Net.IPAddress]::Loopback, [System.Net.IPAddress]::IPv6Loopback)) {
                $listener = [System.Net.Sockets.TcpListener]::new($address, $BuildReportPort)
                $listener.Server.ExclusiveAddressUse = $true
                $listeners.Add($listener)
                $listener.Start()
            }
        }
        $ownedProcess = [System.Diagnostics.Process]::Start($StartInfo)
        [System.IO.File]::WriteAllText((Join-Path $RunDirectory 'process.json'), (@{ pid = $ownedProcess.Id; buildReportGuard = [bool]$GuardBuildReportPort } | ConvertTo-Json))
        $stdoutTask = $ownedProcess.StandardOutput.ReadToEndAsync()
        $stderrTask = $ownedProcess.StandardError.ReadToEndAsync()
        if (-not $ownedProcess.WaitForExit($TimeoutSeconds * 1000)) {
            throw "Test run timed out after $TimeoutSeconds seconds; see $RunDirectory"
        }
        return $ownedProcess.ExitCode
    } finally {
        if ($null -ne $ownedProcess) {
            try {
                if (-not $ownedProcess.HasExited) {
                    $ownedProcess.Kill($true)
                    if (-not $ownedProcess.WaitForExit(5000)) { throw 'Owned test child did not exit after termination' }
                }
                # After the child exits, retain available logs even when launch or
                # wait failed. Log failures must not hide the original exception.
                foreach ($item in @(@{ task = $stdoutTask; name = 'stdout.log' }, @{ task = $stderrTask; name = 'stderr.log' })) {
                    if ($null -ne $item.task) {
                        try { [System.IO.File]::WriteAllText((Join-Path $RunDirectory $item.name), $item.task.GetAwaiter().GetResult()) }
                        catch { Write-Warning "Could not retain $($item.name): $($_.Exception.Message)" }
                    }
                }
            } finally { $ownedProcess.Dispose(); foreach ($listener in $listeners) { $listener.Stop() } }
        } else {
            foreach ($listener in $listeners) { $listener.Stop() }
        }
    }
}
