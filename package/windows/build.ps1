param(
  [Parameter(Mandatory)][string]$Compiler,
  [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$compilerPath = (Resolve-Path -LiteralPath $Compiler).Path
$output = (New-Item -ItemType Directory -Path $OutputDirectory -Force).FullName
$work = Join-Path ([IO.Path]::GetTempPath()) ('kesev-build-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $work | Out-Null
try {
  $nodeVersion = '24.22.1'
  $archive = "node-v$nodeVersion-win-x64.zip"
  $nodeBase = "https://nodejs.org/dist/v$nodeVersion"
  $archivePath = Join-Path $work $archive
  Invoke-WebRequest "$nodeBase/$archive" -OutFile $archivePath
  $checksums = (Invoke-WebRequest "$nodeBase/SHASUMS256.txt").Content -split '\r?\n'
  $entry = $checksums | Where-Object { $_ -match "\s+$([regex]::Escape($archive))$" }
  if (!$entry -or (Get-FileHash $archivePath -Algorithm SHA256).Hash -ne ($entry -split '\s+')[0]) {
    throw 'Node.js archive checksum verification failed.'
  }
  Expand-Archive -LiteralPath $archivePath -DestinationPath $work
  $payload = Join-Path $work 'payload'
  $runtime = New-Item -ItemType Directory -Path (Join-Path $payload 'runtime') -Force
  $nodeDir = Join-Path $work "node-v$nodeVersion-win-x64"
  Copy-Item -LiteralPath (Join-Path $nodeDir 'node.exe'),(Join-Path $nodeDir 'LICENSE') -Destination $runtime
  $launcher = New-Item -ItemType Directory -Path (Join-Path $payload 'launcher')
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'launch.mjs') -Destination $launcher

  $tracked = git -C $repo ls-files -- on-client/public on-client/src on-client/student on-client/vendor on-client/tools on-client/docs on-client/package.json
  if ($LASTEXITCODE -ne 0 -or !$tracked) { throw 'Cannot list application files from Git.' }
  $paths = @($tracked) + @(
    'on-client/public/browser-compat.mjs',
    'xdr/brute-force/decide.mjs',
    'xdr/cloudxdr/server.mjs',
    'xdr/cloudxdr/native-syslog.mjs',
    'xdr/cloudxdr/console.html',
    'xdr/cloudxdr/custom-kesev',
    'xdr/cloudxdr/wazuh-integration.xml',
    'xdr/cloudxdr/README.md',
    'xdr/cloudxdr/demo/send-dual-udp.ps1',
    'xdr/cloudxdr/demo/network-decoder.xml',
    'xdr/cloudxdr/demo/network-rule.xml'
  )
  foreach ($file in ($paths | Sort-Object -Unique)) {
    if ($file -notmatch '^[A-Za-z0-9_.\-/]+$' -or $file -match '(?i)\.(sqlite|db|pem|key|pfx|log)(\.|$)|(^|/)\.env($|\.)') {
      throw "Unexpected package file: $file"
    }
    $target = Join-Path (Join-Path $payload 'app') $file
    New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
    Copy-Item -LiteralPath (Join-Path $repo $file) -Destination $target
  }

  $manifest = @(Get-ChildItem -LiteralPath $payload -Recurse -File | ForEach-Object {
    [ordered]@{path=$_.FullName.Substring($payload.Length+1).Replace('\','/'); sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
  })
  $manifest | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $payload 'payload-manifest.json') -Encoding UTF8
  Copy-Item -LiteralPath (Join-Path $payload 'payload-manifest.json') -Destination $output
  & $compilerPath "/DPayload=$payload" "/O$output" (Join-Path $PSScriptRoot 'setup.iss')
  if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed ($LASTEXITCODE)." }
  Get-FileHash -LiteralPath (Join-Path $output 'Setup.exe') -Algorithm SHA256
} finally {
  $resolved = (Resolve-Path -LiteralPath $work).Path
  if ($resolved -eq $work -and (Split-Path $resolved -Leaf) -like 'kesev-build-*') {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
