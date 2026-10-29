[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$InstallerPath,
  [Parameter(Mandatory=$true)][string]$ReceiptPath,
  [Parameter(Mandatory=$true)][string]$VerificationPath,
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [string]$InstalledDirectory = (Join-Path $env:LOCALAPPDATA 'Programs\JaxOS')
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Run this evidence collector on native Windows.' }
if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -or [IntPtr]::Size -ne 8) { throw 'Use 64-bit PowerShell.' }
$OutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$InstalledDirectory = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($InstalledDirectory)
if (Test-Path -LiteralPath $OutputPath) { throw 'Choose a new output filename; evidence is write-once.' }
$receipt = Get-Content -LiteralPath $ReceiptPath -Raw | ConvertFrom-Json
$verified = Get-Content -LiteralPath $VerificationPath -Raw | ConvertFrom-Json
if ($receipt.version -ne '0.5.1' -or $verified.version -ne $receipt.version -or $verified.status -ne 'pass') {
  throw 'Supply the matching 0.5.1 build receipt and passing package-verification report.'
}
$checks = [System.Collections.Generic.List[object]]::new()
function Assert-Digest([string]$Path, [string]$Expected, [string]$Name) {
  if ($Expected -notmatch '^[0-9a-fA-F]{64}$') { throw "Missing expected digest for $Name." }
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $Expected.ToLowerInvariant()) { throw "Hash mismatch for $Name." }
  $checks.Add([ordered]@{name=$Name;status='pass';sha256=$actual})
}
$report = [ordered]@{
  schemaVersion=1;version=$receipt.version;recordedAt=[DateTime]::UtcNow.ToString('o')
  windowsVersion=[Environment]::OSVersion.Version.ToString();processArchitecture='x64'
  status='partial-native-evidence';checks=$checks;installedCli='not-run'
  manualAcceptance='not-run';gpuAcceptance='not-run'
  note='Artifact and installed CLI checks only; not full install/upgrade/uninstall or model/KiCad acceptance.'
}
$reservation = [IO.File]::Open($OutputPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
$exitResult = 0
try {
  Assert-Digest $InstallerPath $receipt.sha256 'installer'
  if ($verified.installer.sha256 -ne $receipt.sha256) { throw 'Verification report has a different installer.' }
  $exe = Join-Path $InstalledDirectory 'JaxOS.exe'
  if (Test-Path -LiteralPath $exe) {
    Assert-Digest $exe $verified.application.sha256 'installed-executable'
    Assert-Digest (Join-Path $InstalledDirectory 'resources\app.asar') $receipt.appArchiveSha256 'installed-archive'
    $wrapper = Join-Path $InstalledDirectory 'evaluate.cmd'
    Assert-Digest $wrapper $receipt.evaluation.wrapperSha256 'installed-wrapper'
    if ($wrapper.Contains('"')) { throw 'Invalid wrapper path.' }
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = Join-Path $env:SystemRoot 'System32\cmd.exe'
    $start.Arguments = '/d /s /c ""' + $wrapper + '" --help"'
    $start.WorkingDirectory = [IO.Path]::GetTempPath()
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $child = [Diagnostics.Process]::new(); $child.StartInfo = $start
    try {
      if (-not $child.Start()) { throw 'Could not start installed evaluator.' }
      if (-not $child.WaitForExit(30000)) { $child.Kill(); throw 'Installed evaluator help timed out.' }
      $stdout = $child.StandardOutput.ReadToEnd(); $stderr = $child.StandardError.ReadToEnd()
      if ($child.ExitCode -ne 0 -or $stdout -notmatch 'Usage: evaluate run') { throw 'Installed evaluator help failed. Inspect it locally; no raw environment logs are collected.' }
      $report.installedCli = 'pass'
      $checks.Add([ordered]@{name='installed-wrapper-help-from-unrelated-directory';status='pass';exitCode=$child.ExitCode})
    } finally { $child.Dispose() }
  } else {
    $report.installedCli = 'not-installed'
    $exitResult = 1
  }
} catch {
  $report.status = 'failed'
  # Keep personal paths and raw command output out of shareable evidence.
  $report['failure'] = 'A check failed. Inspect the local PowerShell error before sharing details.'
  Write-Warning $_.Exception.Message
  $exitResult = 1
} finally {
  $json = $report | ConvertTo-Json -Depth 8
  $bytes = [Text.Encoding]::UTF8.GetBytes($json + [Environment]::NewLine)
  $reservation.Write($bytes,0,$bytes.Length);$reservation.Dispose()
}
Write-Host "Saved partial native evidence. Complete the manual acceptance form separately."
exit $exitResult
