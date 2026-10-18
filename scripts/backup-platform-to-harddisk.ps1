param([string]$BackupRoot = 'E:\CHMS1-Backups', [switch]$IncludeR2Credentials, [string]$ResumeStage)
$ErrorActionPreference = 'Stop'
$stage = $null
$log = $null
$phase = 'preparation'
function Read-HiddenValue([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secure.Dispose() }
}
try {
  if (!(Test-Path -LiteralPath $BackupRoot -PathType Container)) { throw 'Backup disk is not connected.' }
  $root = [IO.Path]::GetFullPath($BackupRoot).TrimEnd('\')
  if ($ResumeStage) {
    $stage = [IO.Path]::GetFullPath($ResumeStage)
    if ([IO.Path]::GetDirectoryName($stage) -ne $root -or (Split-Path $stage -Leaf) -notmatch '^config-staging-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$') { throw 'Invalid configuration resume path.' }
    $id = (Split-Path $stage -Leaf).Substring(15)
  } else {
    $id = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
    $stage = Join-Path $root "config-staging-$id"
  }
  $log = Join-Path $root "platform-backup-status-$id.log"
  $archive = Join-Path $root "Platform-Config-$id.7z"
  $sevenZip = 'C:\Program Files\7-Zip\7z.exe'
  if (!(Test-Path -LiteralPath $sevenZip)) { throw '7-Zip is missing.' }
  if ($ResumeStage) {
    if (!(Test-Path -LiteralPath $archive -PathType Leaf) -or !(Test-Path -LiteralPath (Join-Path $stage 'inventory.json') -PathType Leaf)) { throw 'Existing archive or inventory is missing.' }
    $inventory = Get-Content -LiteralPath (Join-Path $stage 'inventory.json') -Raw | ConvertFrom-Json
    $IncludeR2Credentials = [bool]$inventory.r2OriginalCredentialBackup.included
    'RESUMING: Only verifying existing archive; no redownload or overwrite.' | Add-Content -LiteralPath $log
  } else {
  if ((Test-Path -LiteralPath $stage) -or (Test-Path -LiteralPath $archive)) { throw 'Refusing to overwrite existing files.' }
  New-Item -ItemType Directory -Path $stage | Out-Null
  & node (Join-Path $PSScriptRoot 'prepare-platform-backup.mjs') $stage $root
  if ($LASTEXITCODE -ne 0) { throw 'Configuration preparation did not complete.' }
  if ($IncludeR2Credentials) {
    'PREPARED: Awaiting original R2 credentials, then encryption.' | Set-Content -LiteralPath $log
    Write-Host 'Enter the original R2 Access Key ID and Secret Access Key below. Input is hidden.'
    Write-Host 'Do not enter an API token or a Supabase/database password. No keys will be rotated.'
    $r2 = @{
      endpoint = 'https://311949335986723af9a0a8b5bd76ebd4.r2.cloudflarestorage.com'
      bucket = 'chms1clc-photos'
      accessKeyId = Read-HiddenValue 'R2 Access Key ID (hidden)'
      secretAccessKey = Read-HiddenValue 'R2 Secret Access Key (hidden)'
    }
    $r2 | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage 'credentials/r2-credentials.json') -Encoding UTF8
    $r2 = $null
    & node (Join-Path $PSScriptRoot 'prepare-platform-backup.mjs') --verify-r2 $stage $root
    if ($LASTEXITCODE -ne 0) { throw 'R2 read-only verification failed; do not treat this as a verified credential backup.' }
  }
  'PREPARED: Partial configuration/local credentials. Awaiting archive encryption.' | Set-Content -LiteralPath $log
  Write-Host 'This supplement does NOT contain all remote secret values. Missing values are listed inside.'
  Write-Host 'At Enter password, enter your backup ENCRYPTION password, not your database password.'
  Write-Host 'The password will not appear. Keep it safely. Do not send it in chat.'
  & $sevenZip a -t7z -mhe=on -p $archive (Join-Path $stage '*')
  if ($LASTEXITCODE -ne 0) { throw 'Archive encryption failed.' }
  }
  $phase = 'encrypted archive verification'
  Write-Host "Verifying existing archive: $archive"
  Write-Host 'Enter the SAME encryption password again to verify the archive.'
  & $sevenZip t $archive
  if ($LASTEXITCODE -ne 0) { throw 'Archive verification failed.' }
  $phase = 'checksum and staging cleanup'
  $sha = [Security.Cryptography.SHA256]::Create()
  $stream = [IO.File]::OpenRead($archive)
  try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
  finally { $stream.Dispose(); $sha.Dispose() }
  "$hash  $(Split-Path $archive -Leaf)" | Set-Content -LiteralPath "$archive.sha256" -Encoding ASCII
  $resolvedStage = [IO.Path]::GetFullPath($stage)
  if ([IO.Path]::GetDirectoryName($resolvedStage) -ne $root -or (Split-Path $resolvedStage -Leaf) -notmatch '^config-staging-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$') { throw 'Cleanup path is outside the expected staging area.' }
  Remove-Item -LiteralPath $resolvedStage -Recurse -Force
  "VERIFIED: $archive" | Add-Content -LiteralPath $log
  if ($IncludeR2Credentials) {
    'R2 ORIGINAL CREDENTIALS INCLUDED: Read-only bucket verification passed. Other custom secrets and complete recovery remain outstanding.' | Add-Content -LiteralPath $log
  } else {
    'PARTIAL SCOPE: Original R2/custom secret values and complete platform recovery remain outstanding.' | Add-Content -LiteralPath $log
  }
  Write-Host "Encrypted configuration supplement verified: $archive"
  Write-Host 'Unencrypted staging removed. Original credential files and older backups were not deleted.'
} catch {
  if ($log) { "NOT COMPLETED at $phase. Preserve existing files; review staging before disconnecting." | Add-Content -LiteralPath $log }
  Write-Host 'CONFIGURATION BACKUP NOT COMPLETED. Existing files were preserved.'
  if ($stage) { Write-Host "Unencrypted credentials may remain at: $stage" }
  Write-Host 'Do not share the staging directory. Ask for review before disconnecting the disk.'
}
