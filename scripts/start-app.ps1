param(
    [ValidateRange(1024, 65535)][int]$ApiPort = 8000,
    [ValidateRange(1024, 65535)][int]$WebPort = 5173,
    [ValidateRange(15, 300)][int]$TimeoutSeconds = 180,
    [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$webRoot = Join-Path $repoRoot 'web'
$outputsDir = Join-Path $repoRoot 'outputs'
$ollamaVersionUrl = 'http://127.0.0.1:11434/api/version'
$webUrl = "http://127.0.0.1:$WebPort/"
$webProbeUrl = "http://127.0.0.1:$WebPort/"
$webEnvPath = Join-Path $webRoot '.env.local'
$expectedApiVersion = '0.3.3'

New-Item -ItemType Directory -Force -Path $outputsDir | Out-Null

function Wait-ForHttp([string]$Url, [int]$Seconds, [string]$Label, [switch]$Quiet, [string]$ExpectedContent = '') {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        try {
            $response = Invoke-WebRequest -Uri $Url -TimeoutSec 4 -UseBasicParsing
            $isSuccess = $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
            $hasExpectedContent = -not $ExpectedContent -or $response.Content.IndexOf($ExpectedContent, [StringComparison]::OrdinalIgnoreCase) -ge 0
            if ($isSuccess -and $hasExpectedContent) { return $true }
        } catch { }
        Start-Sleep -Milliseconds 700
    } while ((Get-Date) -lt $deadline)
    if (-not $Quiet) { Write-Warning "$Label 응답을 기다리는 동안 시간이 초과됐습니다: $Url" }
    return $false
}

function Test-PortListener([int]$Port) {
    $probe = [System.Net.Sockets.TcpClient]::new()
    try {
        $attempt = $probe.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $attempt.AsyncWaitHandle.WaitOne(350)) { return $false }
        try { $probe.EndConnect($attempt); return $true } catch { return $false }
    } catch {
        return $false
    } finally {
        $probe.Dispose()
    }
}

function Get-LocalApiVersion([int]$Port) {
    try {
        $spec = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/openapi.json" -TimeoutSec 2
        return [string]$spec.info.version
    } catch {
        return ''
    }
}

function Test-LocalApiDocumentStore([int]$Port) {
    try {
        $null = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/auth/providers" -TimeoutSec 3
        return $true
    } catch {
        return $false
    }
}

function Get-WebApiVersion([int]$Port) {
    try {
        $spec = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/openapi.json" -TimeoutSec 2
        return [string]$spec.info.version
    } catch {
        return ''
    }
}

$apiHealthUrl = "http://127.0.0.1:$ApiPort/api/health"
$existingApiVersion = Get-LocalApiVersion $ApiPort
if ((Test-PortListener $ApiPort) -and ($existingApiVersion -ne $expectedApiVersion -or -not (Test-LocalApiDocumentStore $ApiPort))) {
    $shownExistingApiVersion = if ($existingApiVersion) { $existingApiVersion } else { '확인 불가' }
    Write-Host "기존 API 버전($shownExistingApiVersion)의 문서 목록을 사용할 수 없습니다. 기존 프로세스는 유지하고 새 API 포트를 찾습니다."
    $candidatePort = $ApiPort + 1
    $selectedApiPort = $null
    while ($candidatePort -le 65535) {
        $candidateVersion = Get-LocalApiVersion $candidatePort
        if ($candidateVersion -eq $expectedApiVersion -and (Test-LocalApiDocumentStore $candidatePort)) {
            $selectedApiPort = $candidatePort
            break
        }
        if (-not (Test-PortListener $candidatePort)) {
            $selectedApiPort = $candidatePort
            break
        }
        $candidatePort += 1
    }
    if ($null -eq $selectedApiPort) { throw '현재 코드에 맞는 API 포트를 찾지 못했습니다.' }
    $ApiPort = $selectedApiPort
}

$apiHealthUrl = "http://127.0.0.1:$ApiPort/api/health"
$apiReadyUrl = "http://127.0.0.1:$ApiPort/api/ready"
$desiredWebEnv = "VITE_PROXY_TARGET=http://127.0.0.1:$ApiPort`n"
$currentWebEnv = if (Test-Path $webEnvPath) { [System.IO.File]::ReadAllText($webEnvPath) } else { '' }
if ($currentWebEnv -cne $desiredWebEnv) {
    [System.IO.File]::WriteAllText($webEnvPath, $desiredWebEnv)
}

$ollamaAvailable = Wait-ForHttp $ollamaVersionUrl 1 'Ollama' -Quiet
if (-not $ollamaAvailable) {
    if (Test-PortListener 11434) {
        Write-Host 'Ollama 포트가 열려 있습니다. 기존 서버 응답을 기다립니다.'
        $ollamaAvailable = Wait-ForHttp $ollamaVersionUrl 30 'Ollama'
    } else {
        $portableOllama = Join-Path $env:USERPROFILE 'AppData\Local\Programs\Ollama\portable-0.40.11\ollama.exe'
        $ollamaExecutable = if (Test-Path $portableOllama) { $portableOllama } else { $null }
        $ollamaCommand = $null
        if (-not $ollamaExecutable) {
            $ollamaCommand = Get-Command 'ollama.exe' -ErrorAction SilentlyContinue
        }
        if (-not $ollamaExecutable -and -not $ollamaCommand) { $ollamaCommand = Get-Command 'ollama' -ErrorAction SilentlyContinue }
        if (-not $ollamaExecutable -and $ollamaCommand) { $ollamaExecutable = $ollamaCommand.Source }
        if ($ollamaExecutable) {
            $ollamaStdout = Join-Path $outputsDir 'local-ollama.stdout.log'
            $ollamaStderr = Join-Path $outputsDir 'local-ollama.stderr.log'
            Start-Process -FilePath $ollamaExecutable -ArgumentList 'serve' -WindowStyle Hidden -WorkingDirectory $repoRoot -RedirectStandardOutput $ollamaStdout -RedirectStandardError $ollamaStderr | Out-Null
            $ollamaAvailable = Wait-ForHttp $ollamaVersionUrl 30 'Ollama'
            if (-not $ollamaAvailable) { Write-Host "Ollama 로그: $ollamaStderr" }
        } else {
            Write-Warning 'Ollama 실행 파일을 찾지 못했습니다. 로컬 Ollama를 설치한 뒤 다시 시작하세요.'
        }
    }
}

if (-not (Wait-ForHttp $apiHealthUrl 1 'API' -Quiet)) {
    if (Test-PortListener $ApiPort) {
        throw "API 포트 ${ApiPort}은 이미 사용 중이지만 문서담 API가 응답하지 않습니다. 기존 프로세스는 종료하지 않았습니다."
    }
    $apiStdout = Join-Path $outputsDir 'local-api.stdout.log'
    $apiStderr = Join-Path $outputsDir 'local-api.stderr.log'
    $apiScript = Join-Path $PSScriptRoot 'run-local.ps1'
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$apiScript`" -ApiPort $ApiPort"
    Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -WorkingDirectory $repoRoot -ArgumentList $arguments -RedirectStandardOutput $apiStdout -RedirectStandardError $apiStderr | Out-Null
    if (-not (Wait-ForHttp $apiHealthUrl $TimeoutSeconds 'API')) {
        Write-Host "API 로그: $apiStderr"
        throw 'API 시작에 실패했습니다. 포트, Python 가상환경, Ollama 실행 상태를 확인하세요.'
    }
}

if ((Get-LocalApiVersion $ApiPort) -ne $expectedApiVersion) {
    throw "API 포트 ${ApiPort}에서 현재 코드 버전 $expectedApiVersion 를 확인하지 못했습니다. 기존 프로세스는 종료하지 않았습니다."
}

if (-not (Wait-ForHttp $webProbeUrl 1 '웹 서버' -Quiet -ExpectedContent 'id="root"') -or (Get-WebApiVersion $WebPort) -ne $expectedApiVersion) {
    if (Test-PortListener $WebPort) {
        # A busy but slow-to-answer Vite process should be reused when it catches up.
        $existingWebIsCurrent = (Wait-ForHttp $webProbeUrl 5 '웹 서버' -Quiet -ExpectedContent 'id="root"') -and (Get-WebApiVersion $WebPort) -eq $expectedApiVersion
        if (-not $existingWebIsCurrent) {
            Write-Host "웹 포트 ${WebPort}은 다른 서비스가 사용 중입니다. 기존 프로세스는 유지하고 다음 빈 포트를 찾습니다."
            $candidatePort = $WebPort + 1
            $searchLimit = [Math]::Min(65535, $WebPort + 32)
            $firstFreePort = $null
            $matchingAppPort = $null
            while ($candidatePort -le $searchLimit) {
                $candidateUrl = "http://127.0.0.1:$candidatePort/"
                if (-not (Test-PortListener $candidatePort)) {
                    if ($null -eq $firstFreePort) { $firstFreePort = $candidatePort }
                } elseif ((Wait-ForHttp $candidateUrl 1 '웹 서버' -Quiet -ExpectedContent 'id="root"') -and (Get-WebApiVersion $candidatePort) -eq $expectedApiVersion) {
                    $matchingAppPort = $candidatePort
                    break
                }
                $candidatePort += 1
            }
            if ($null -ne $matchingAppPort) {
                $WebPort = $matchingAppPort
            } elseif ($null -ne $firstFreePort) {
                $WebPort = $firstFreePort
            } else {
                $candidatePort = $searchLimit + 1
                while ($candidatePort -le 65535 -and (Test-PortListener $candidatePort)) { $candidatePort += 1 }
                if ($candidatePort -gt 65535) { throw '문서담 웹 화면을 시작할 수 있는 포트를 찾지 못했습니다.' }
                $WebPort = $candidatePort
            }
            $webUrl = "http://127.0.0.1:$WebPort/"
            $webProbeUrl = "http://127.0.0.1:$WebPort/"
        }
    }
}

if (-not (Wait-ForHttp $webProbeUrl 1 '웹 서버' -Quiet -ExpectedContent 'id="root"')) {
    if (Test-PortListener $WebPort) {
        throw "웹 포트 ${WebPort}은 이미 사용 중이지만 문서담 웹 화면이 응답하지 않습니다. 기존 프로세스는 종료하지 않았습니다."
    }
    $viteExecutable = Join-Path $webRoot 'node_modules\.bin\vite.cmd'
    if (-not (Test-Path $viteExecutable)) { throw '웹 의존성이 없습니다. web 폴더에서 npm ci를 먼저 실행하세요.' }
    $webStdout = Join-Path $outputsDir 'local-web.stdout.log'
    $webStderr = Join-Path $outputsDir 'local-web.stderr.log'
    Start-Process -FilePath $viteExecutable -WindowStyle Hidden -WorkingDirectory $webRoot -ArgumentList @('--host', '127.0.0.1', '--port', "$WebPort", '--strictPort') -RedirectStandardOutput $webStdout -RedirectStandardError $webStderr | Out-Null
    if (-not (Wait-ForHttp $webProbeUrl $TimeoutSeconds '웹 서버' -ExpectedContent 'id="root"')) {
        Write-Host "웹 서버 로그: $webStderr"
        throw '웹 서버 시작에 실패했습니다. web/node_modules와 포트 설정을 확인하세요.'
    }
}

$ready = $null
try { $ready = Invoke-RestMethod -Uri "$apiReadyUrl`?force=true" -TimeoutSec $TimeoutSeconds } catch {
    Write-Warning "웹 화면은 준비됐지만 모델 상태를 확인하지 못했습니다: $($_.Exception.Message)"
}

Write-Host ''
Write-Host "문서담 웹 화면: $webUrl"
Write-Host "API 상태: $apiHealthUrl"
if ($ready) {
    Write-Host "데이터베이스: $($ready.database.backend) ($($ready.database.available))"
    Write-Host "Ollama: $($ready.ollama.version) ($($ready.ollama.available))"
    Write-Host "답변 모델 $($ready.models.chat.name): functional=$($ready.models.chat.functional)"
    Write-Host "임베딩 모델 $($ready.models.embedding.name): functional=$($ready.models.embedding.functional), dimensions=$($ready.models.embedding.dimensions)"
    if ($ready.models.chat.name -ne 'qwen3:4b-instruct' -or $ready.models.embedding.name -ne 'embeddinggemma') {
        Write-Warning 'API가 지정된 모델 이름으로 응답하지 않습니다. 다른 모델로 바꾸지 않았습니다.'
    }
} else {
    Write-Warning '웹은 열렸지만 답변과 의미 검색을 쓰려면 Ollama 및 지정 모델 상태를 확인해야 합니다.'
}

if (-not $ready) {
    Write-Warning '웹 화면은 열렸지만 준비 상태를 확인하지 못했습니다. API 로그와 로컬 서비스 상태를 확인하세요.'
} elseif (-not $ready.database.available) {
    Write-Warning '문서 저장소를 사용할 수 없습니다. API 로그를 확인하세요.'
} elseif (-not $ready.ollama.available) {
    Write-Warning "로컬 Ollama 서버를 사용할 수 없습니다. Ollama 설치와 실행을 확인하세요. 로그: $outputsDir\local-ollama.stderr.log"
} else {
    $missingModels = @()
    if (-not $ready.models.chat.installed) { $missingModels += 'ollama pull qwen3:4b-instruct' }
    if (-not $ready.models.embedding.installed) { $missingModels += 'ollama pull embeddinggemma' }
    if ($missingModels.Count -gt 0) {
        Write-Warning "지정 모델이 설치되지 않았습니다. 필요한 모델만 준비하세요: $($missingModels -join ' ; ')"
    } elseif (-not $ready.models.chat.functional -or -not $ready.models.embedding.functional) {
        Write-Warning "모델은 설치되어 있지만 실제 호출에 실패했습니다. 다른 모델로 바꾸거나 다시 다운로드하지 말고 Ollama 실행 파일과 로그를 확인하세요. 로그: $outputsDir\local-ollama.stderr.log"
    }
}

if ($OpenBrowser) {
    try {
        Start-Process $webUrl -ErrorAction Stop | Out-Null
    } catch {
        Write-Warning "서비스는 실행됐지만 브라우저를 자동으로 열지 못했습니다. 주소를 직접 열어 주세요: $webUrl"
    }
}
