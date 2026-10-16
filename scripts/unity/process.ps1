#Requires -Version 7.2
Set-StrictMode -Version Latest

function Invoke-CampMindTestProcess {
    param(
        [Parameter(Mandatory)][System.Diagnostics.ProcessStartInfo]$StartInfo,
        [Parameter(Mandatory)][string]$RunDirectory,
        [ValidateRange(1, 7200)][int]$TimeoutSeconds = 600
    )
    $ownedProcess = $null
    $stdoutTask = $null
    $stderrTask = $null
    try {
        $ownedProcess = [System.Diagnostics.Process]::Start($StartInfo)
        [System.IO.File]::WriteAllText((Join-Path $RunDirectory 'process.json'), (@{ pid = $ownedProcess.Id } | ConvertTo-Json))
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
            } finally { $ownedProcess.Dispose() }
        }
    }
}
