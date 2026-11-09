param([ValidateRange(1024, 65535)][int]$ApiPort = 8000)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $repoRoot 'data'
$storageDir = Join-Path $dataDir 'uploads'
$databasePath = Join-Path $dataDir 'local.sqlite3'

$portProbe = [System.Net.Sockets.TcpClient]::new()
$portIsOpen = $false
try {
    $connectAttempt = $portProbe.BeginConnect('127.0.0.1', $ApiPort, $null, $null)
    $portIsOpen = $connectAttempt.AsyncWaitHandle.WaitOne(350)
    if ($portIsOpen) {
        try { $portProbe.EndConnect($connectAttempt) } catch { $portIsOpen = $false }
    }
} finally {
    $portProbe.Dispose()
}
if ($portIsOpen) {
    throw "로컬 API 포트 ${ApiPort}이 이미 사용 중입니다. 기존 프로세스는 종료하지 않았습니다."
}

New-Item -ItemType Directory -Force -Path $storageDir | Out-Null
$env:DATABASE_URL = 'sqlite:///' + ($databasePath -replace '\\', '/')
$env:STORAGE_DIR = $storageDir
$env:OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
$env:OLLAMA_CHAT_MODEL = 'qwen3:4b-instruct'
$env:OLLAMA_EMBEDDING_MODEL = 'embeddinggemma'
$env:AUTH_COOKIE_SECURE = 'false'
if (Test-Path (Join-Path $repoRoot '.env')) {
    foreach ($line in [System.IO.File]::ReadAllLines((Join-Path $repoRoot '.env'))) {
        if ($line -match '^\s*(KAKAO_CLIENT_ID|KAKAO_CLIENT_SECRET|KAKAO_REDIRECT_URI|AUTH_COOKIE_SECURE|APP_ORIGIN|SMTP_HOST|SMTP_PORT|SMTP_USER|SMTP_PASSWORD|SMTP_FROM)\s*=\s*(.*?)\s*$') {
            $value = $Matches[2].Trim().Trim('"').Trim("'")
            [Environment]::SetEnvironmentVariable($Matches[1], $value, 'Process')
        }
    }
}

$python = Join-Path $repoRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) { throw "프로젝트 가상환경을 찾을 수 없습니다: $python" }
Write-Host '로컬 SQLite 개발 모드로 API를 시작합니다. 지정 Ollama 모델만 사용합니다.'
Write-Host "API만 실행합니다. 웹 화면까지 열려면 별도 PowerShell에서 .\scripts\start-app.ps1 -ApiPort $ApiPort 를 실행하세요."
Write-Host "API 준비 상태: http://localhost:$ApiPort/api/ready"
$webEnvPath = Join-Path $repoRoot 'web\.env.local'
[System.IO.File]::WriteAllText($webEnvPath, "VITE_PROXY_TARGET=http://127.0.0.1:$ApiPort`n")
Push-Location $repoRoot
try {
    & $python -m uvicorn app.main:app --app-dir server --host 127.0.0.1 --port $ApiPort
} finally {
    Pop-Location
}
$ApiPort = 8000
