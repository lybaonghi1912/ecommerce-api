param(
  [ValidatePattern('^[a-zA-Z0-9_]{3,50}$')][string]$AdminUsername = 'admin',
  [ValidateRange(1,65535)][int]$Port = 3000,
  [ValidateRange(1,65535)][int]$PostgresPort = 5432
)
$ErrorActionPreference = 'Stop'
$taskProjectRoot = Split-Path -Parent $PSScriptRoot
$taskEnvPath = Join-Path $taskProjectRoot '.env'
if (Test-Path -LiteralPath $taskEnvPath) {
  throw '.env đã tồn tại. Script không ghi đè cấu hình hoặc mật khẩu đang dùng.'
}
function New-TaskSecret([int]$count) {
  $taskBytes = New-Object byte[] $count
  $taskGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $taskGenerator.GetBytes($taskBytes) } finally { $taskGenerator.Dispose() }
  return ([BitConverter]::ToString($taskBytes)).Replace('-', '').ToLowerInvariant()
}
$taskDbPassword = New-TaskSecret 24
$taskAdminPassword = New-TaskSecret 24
$taskJwtSecret = New-TaskSecret 32
$taskText = @"
NODE_ENV=development
PORT=$Port

POSTGRES_DB=ecommerce
POSTGRES_USER=ecommerce_app
POSTGRES_PASSWORD=$taskDbPassword
POSTGRES_PORT=$PostgresPort
DATABASE_URL=postgresql://ecommerce_app:${taskDbPassword}@localhost:${PostgresPort}/ecommerce?schema=public

ADMIN_USERNAME=$AdminUsername
ADMIN_FULLNAME=Administrator
ADMIN_PASSWORD=$taskAdminPassword

JWT_SECRET=$taskJwtSecret
JWT_EXPIRES_IN_SECONDS=900
JWT_ISSUER=ecommerce-api
JWT_AUDIENCE=ecommerce-client
"@
$taskEncoding = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($taskEnvPath, $taskText + [Environment]::NewLine, $taskEncoding)
Write-Output 'Đã tạo .env với mật khẩu và JWT secret ngẫu nhiên. Xem ADMIN_PASSWORD bằng Notepad trên máy của bạn.'

