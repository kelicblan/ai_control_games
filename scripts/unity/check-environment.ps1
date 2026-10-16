#Requires -Version 7.2
param([string]$Editor, [switch]$Json)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'environment.ps1')
$report = Get-CampMindUnityEnvironment -Editor $Editor
if ($Json) { $report | ConvertTo-Json -Depth 4 }
else { $report | Format-List }
if (-not $report.readyForUnityValidation) { exit 3 }
