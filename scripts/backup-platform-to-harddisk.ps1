param([string]$BackupRoot = 'E:\CHMS1-Backups')
$ErrorActionPreference = 'Stop'
$stage = $null
$log = $null
try {
  if (!(Test-Path -LiteralPath $BackupRoot -PathType Container)) { throw 'Backup disk is not connected.' }
  $root = [IO.Path]::GetFullPath($BackupRoot).TrimEnd('\')
  $id = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
  $stage = Join-Path $root "config-staging-$id"
  $log = Join-Path $root "platform-backup-status-$id.log"
  $archive = Join-Path $root "Platform-Config-$id.7z"
  $sevenZip = 'C:\Program Files\7-Zip\7z.exe'
  if (!(Test-Path -LiteralPath $sevenZip)) { throw '7-Zip is missing.' }
  if ((Test-Path -LiteralPath $stage) -or (Test-Path -LiteralPath $archive)) { throw 'Refusing to overwrite existing files.' }
  New-Item -ItemType Directory -Path $stage | Out-Null
  & node (Join-Path $PSScriptRoot 'prepare-platform-backup.mjs') $stage $root
  if ($LASTEXITCODE -ne 0) { throw 'Configuration preparation did not complete.' }
  'PREPARED: Partial configuration/local credentials. Awaiting archive encryption.' | Set-Content -LiteralPath $log
  Write-Host 'This supplement does NOT contain all remote secret values. Missing values are listed inside.'
  Write-Host 'At Enter password, enter your backup ENCRYPTION password, not your database password.'
  Write-Host 'The password will not appear. Keep it safely. Do not send it in chat.'
  & $sevenZip a -t7z -mhe=on -p $archive (Join-Path $stage '*')
  if ($LASTEXITCODE -ne 0) { throw 'Archive encryption failed.' }
  Write-Host 'Enter the SAME encryption password again to verify the archive.'
  & $sevenZip t $archive
  if ($LASTEXITCODE -ne 0) { throw 'Archive verification failed.' }
  $sha = [Security.Cryptography.SHA256]::Create()
  $stream = [IO.File]::OpenRead($archive)
  try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
  finally { $stream.Dispose(); $sha.Dispose() }
  "$hash  $(Split-Path $archive -Leaf)" | Set-Content -LiteralPath "$archive.sha256" -Encoding ASCII
  $resolvedStage = [IO.Path]::GetFullPath($stage)
  if ([IO.Path]::GetDirectoryName($resolvedStage) -ne $root -or (Split-Path $resolvedStage -Leaf) -notmatch '^config-staging-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$') { throw 'Cleanup path is outside the expected staging area.' }
  Remove-Item -LiteralPath $resolvedStage -Recurse -Force
  "VERIFIED: $archive" | Add-Content -LiteralPath $log
  'PARTIAL SCOPE: Original R2/custom secret values and complete platform recovery remain outstanding.' | Add-Content -LiteralPath $log
  Write-Host "Encrypted configuration supplement verified: $archive"
  Write-Host 'Unencrypted staging removed. Original credential files and older backups were not deleted.'
} catch {
  if ($log) { 'NOT COMPLETED. Preserve existing files; review staging before disconnecting.' | Add-Content -LiteralPath $log }
  Write-Host 'CONFIGURATION BACKUP NOT COMPLETED. Existing files were preserved.'
  if ($stage) { Write-Host "Unencrypted credentials may remain at: $stage" }
  Write-Host 'Do not share the staging directory. Ask for review before disconnecting the disk.'
}
