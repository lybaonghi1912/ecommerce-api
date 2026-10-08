param([int]$Port = 3000)
$ErrorActionPreference = 'Stop'
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Invalid port.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    $sql = @'
WITH created AS (
  INSERT INTO "Product" (pname,price,quantity)
  VALUES ('X',100000.00,10),('Y',200000.00,20)
  RETURNING pid,pname,price,quantity
) SELECT json_agg(created ORDER BY pname) FROM created;
'@
    $result = $sql | docker compose exec -T db sh -c 'exec psql -X -q -t -A -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
    if ($LASTEXITCODE -ne 0) { throw 'Product creation failed.' }
    $products = ($result -join "`n") | ConvertFrom-Json
    if ($products.Count -ne 2) { throw 'Expected 2 products.' }
    $x = $products | Where-Object { $_.pname -eq 'X' }
    $y = $products | Where-Object { $_.pname -eq 'Y' }
    $demoDir = Join-Path $projectRoot '.demo'
    New-Item -ItemType Directory -Force $demoDir | Out-Null
    $values = @(
        @{key='base_url';value="http://localhost:$Port";enabled=$true;type='default'},
        @{key='admin_username';value='admin';enabled=$true;type='default'},
        @{key='admin_password';value='';enabled=$true;type='secret'},
        @{key='product_x';value=[string]$x.pid;enabled=$true;type='default'},
        @{key='product_y';value=[string]$y.pid;enabled=$true;type='default'}
    )
    $target = Join-Path $demoDir 'Prompt2-Local.postman_environment.json'
    @{name='Prompt 2 - CLI products';values=$values;_postman_variable_scope='environment'} | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $target
    $products | Format-Table pid,pname,price,quantity
    Write-Host "PASS: created X(10 units), Y(20 units) using PostgreSQL CLI."
    Write-Host "Import environment: $target"
    Write-Host 'Enter your admin username/password in Postman locally. Every run creates a new pair; existing products are preserved.'
} finally { Pop-Location }
