$ErrorActionPreference = 'Stop'
$desktopRoot = $PSScriptRoot
$toolsDir = Join-Path $desktopRoot 'tools'
$nuget = Join-Path $toolsDir 'nuget.exe'
$solution = Join-Path $desktopRoot 'FormaDesktop.sln'
$vswhereCandidates = @((Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'),(Join-Path $env:ProgramFiles 'Microsoft Visual Studio\Installer\vswhere.exe'))
$vswhere = $vswhereCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $vswhere) { throw 'Visual Studio 2022 Build Tools with the Desktop development with C++ workload is required.' }
$msbuild = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -find MSBuild\**\Bin\MSBuild.exe | Select-Object -First 1
if (-not $msbuild -and (Test-Path 'C:\BuildTools\MSBuild\Current\Bin\MSBuild.exe')) { $msbuild = 'C:\BuildTools\MSBuild\Current\Bin\MSBuild.exe' }
if (-not $msbuild) { throw 'MSBuild was not found. Install the Visual Studio 2022 C++ build tools.' }
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
if (-not (Test-Path $nuget)) { Invoke-WebRequest 'https://dist.nuget.org/win-x86-commandline/latest/nuget.exe' -OutFile $nuget }
& $nuget restore $solution -PackagesDirectory (Join-Path $desktopRoot 'packages') -NonInteractive
& $msbuild $solution /m /p:Configuration=Release /p:Platform=x64
if ($LASTEXITCODE -ne 0) { throw "Desktop build failed with exit code $LASTEXITCODE." }
$runtime = Join-Path $desktopRoot 'runtime'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
$runtimeNode = Join-Path $runtime 'node.exe'
if ($node -and -not (Test-Path $runtimeNode)) { Copy-Item -LiteralPath $node -Destination $runtimeNode }
$output = Join-Path $desktopRoot 'bin\x64\Release\Forma.exe'
Write-Host "Built $output"
Write-Host 'The executable starts the local service in the background and opens the editor in a native window.'
