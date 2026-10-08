param(
    [Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$OrderId,
    [Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$ProductX,
    [Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$ProductY
)
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    $sql = @"
SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;
SELECT u.uid,u.username,r.rolename,m.mname,m.score FROM "User" u JOIN "Role" r USING(roleid) JOIN "MemberShip" m USING(mid) JOIN "Order" o USING(uid) WHERE o.oid=$OrderId;
SELECT oid,uid,createat FROM "Order" WHERE oid=$OrderId;
SELECT d.oid,d.pid,p.pname,d.qty,d.unit_price,d.qty*d.unit_price AS subtotal FROM "OrderDetail" d JOIN "Product" p USING(pid) WHERE d.oid=$OrderId ORDER BY p.pname;
SELECT pid,pname,price,quantity FROM "Product" WHERE pid IN ($ProductX,$ProductY) ORDER BY pname;
SELECT shipid,oid,status FROM "Shipment" WHERE oid=$OrderId ORDER BY shipid;
SELECT (SELECT COUNT(*) FROM "OrderDetail" WHERE oid=$OrderId)=2
 AND EXISTS(SELECT 1 FROM "OrderDetail" WHERE oid=$OrderId AND pid=$ProductX AND qty=2 AND unit_price=100000.00)
 AND EXISTS(SELECT 1 FROM "OrderDetail" WHERE oid=$OrderId AND pid=$ProductY AND qty=5 AND unit_price=200000.00)
 AND EXISTS(SELECT 1 FROM "Product" WHERE pid=$ProductX AND quantity=8)
 AND EXISTS(SELECT 1 FROM "Product" WHERE pid=$ProductY AND quantity=15)
 AND EXISTS(SELECT 1 FROM "Shipment" WHERE oid=$OrderId AND status='PENDING')
 AND EXISTS(SELECT 1 FROM "Order" o JOIN "User" u USING(uid) JOIN "Role" r USING(roleid) JOIN "MemberShip" m USING(mid) WHERE o.oid=$OrderId AND r.rolename='normal' AND m.score=10)
 AS prompt2_demo_pass \gset
\echo prompt2_demo_pass=:prompt2_demo_pass
\if :prompt2_demo_pass
\echo PASS
\else
\echo FAIL
\quit 1
\endif
"@
    $sql | docker compose exec -T db sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
    if ($LASTEXITCODE -ne 0) { throw 'SQL verification failed.' }
    Write-Host 'Expected: normal/10, X qty=2 stock=8, Y qty=5 stock=15, total=1200000.00, PENDING shipment; prompt2_demo_pass=t.'
} finally { Pop-Location }
