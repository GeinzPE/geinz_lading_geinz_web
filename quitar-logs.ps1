param([switch]$Simular)

$utf8 = New-Object System.Text.UTF8Encoding($false)
$raiz = (Get-Location).Path

# ============ 1) ARCHIVOS BASURA ============
# .backup.js, .bak, .bank, .old, .orig, ~, "copy/copia", (1), debug .txt/.log
$regexBasura = '(\.backup\.|\.bak$|\.bank$|\.old$|\.orig$|~$|[-_ ](copy|copia)(\.|[-_ (]|\d)|\(\d+\)\.|debug.*\.(txt|log)$)'

$todos = Get-ChildItem -Path . -Recurse -File -Force |
    Where-Object { $_.FullName -notmatch '\\(node_modules|\.git)\\' }

$basura = $todos | Where-Object { $_.Name -match $regexBasura }
$basuraRutas = @($basura | ForEach-Object { $_.FullName })

# Texto de los archivos que SI se quedan (para ver si alguien usa la basura por nombre)
$corpus = ($todos |
    Where-Object { $basuraRutas -notcontains $_.FullName -and $_.Extension -match '^\.(js|mjs|html|json|css)$' -and $_.Length -lt 3MB } |
    ForEach-Object { [System.IO.File]::ReadAllText($_.FullName) }) -join "`n"

$borrados = 0
$omitidos = 0
$bytes = 0
foreach ($f in $basura) {
    $rel = $f.FullName.Replace($raiz + '\', '')
    if ($corpus.Contains($f.Name)) {
        Write-Host ("OMITIDO (otro archivo lo menciona): {0}" -f $rel) -ForegroundColor Yellow
        $omitidos++
        continue
    }
    Write-Host ("BORRAR  {0}" -f $rel)
    $bytes += $f.Length
    $borrados++
    if (-not $Simular) { Remove-Item -LiteralPath $f.FullName -Force }
}

# ============ 2) CONSOLE.LOG (solo carpeta public) ============
$patron = [regex]'console\s*\.\s*log\s*\('

function Quitar-ConsoleLog([string]$t) {
    $sb = New-Object System.Text.StringBuilder
    $pos = 0
    $cant = 0
    while ($true) {
        $m = $patron.Match($t, $pos)
        if (-not $m.Success) { break }

        $i = $m.Index + $m.Length
        $prof = 1
        while ($i -lt $t.Length -and $prof -gt 0) {
            $c = $t[$i]
            if ($c -eq '"' -or $c -eq "'" -or $c -eq '`') {
                $q = $c; $i++
                while ($i -lt $t.Length -and $t[$i] -ne $q) {
                    if ($t[$i] -eq '\') { $i++ }
                    $i++
                }
            }
            elseif ($c -eq '(') { $prof++ }
            elseif ($c -eq ')') { $prof-- }
            $i++
        }
        if ($prof -ne 0) {
            $sb.Append($t.Substring($pos, $m.Index + $m.Length - $pos)) | Out-Null
            $pos = $m.Index + $m.Length
            continue
        }
        $fin = $i

        $ini = $t.LastIndexOf("`n", [Math]::Max(0, $m.Index - 1)) + 1
        if ($m.Index -eq 0) { $ini = 0 }
        $antes = $t.Substring($ini, $m.Index - $ini)

        $j = $fin
        while ($j -lt $t.Length -and ($t[$j] -eq ' ' -or $t[$j] -eq "`t")) { $j++ }
        if ($j -lt $t.Length -and $t[$j] -eq ';') { $j++ }
        while ($j -lt $t.Length -and ($t[$j] -eq ' ' -or $t[$j] -eq "`t")) { $j++ }
        $finLinea = ($j -ge $t.Length) -or ($t[$j] -eq "`r") -or ($t[$j] -eq "`n")

        if ($antes -match '^\s*$' -and $finLinea -and $ini -ge $pos) {
            $k = $ini - 1
            while ($k -ge 0 -and [char]::IsWhiteSpace($t[$k])) { $k-- }
            $previo = ''
            if ($k -ge 0) { $previo = $t.Substring([Math]::Max(0, $k - 3), [Math]::Min(4, $k + 1)) }
            $necesita = $previo.EndsWith(')') -or $previo.EndsWith('else') -or $previo.EndsWith('=>')

            $sb.Append($t.Substring($pos, $ini - $pos)) | Out-Null
            if ($necesita) {
                $sb.Append($antes + ';') | Out-Null
                $pos = $j
            } else {
                if ($j -lt $t.Length -and $t[$j] -eq "`r") { $j++ }
                if ($j -lt $t.Length -and $t[$j] -eq "`n") { $j++ }
                $pos = $j
            }
        }
        else {
            $sb.Append($t.Substring($pos, $m.Index - $pos)) | Out-Null
            $sb.Append('void 0') | Out-Null
            $pos = $fin
        }
        $cant++
    }
    $sb.Append($t.Substring($pos)) | Out-Null
    return @{ Texto = $sb.ToString(); Cantidad = $cant }
}

$totalLogs = 0
$archivos = Get-ChildItem -Path .\public -Recurse -File -Include *.js, *.mjs, *.html |
    Where-Object {
        $_.FullName -notmatch '\\(node_modules|\.git)\\' -and
        $_.Name -notlike '*.min.js' -and
        $_.Name -notmatch $regexBasura
    }

foreach ($f in $archivos) {
    $orig = [System.IO.File]::ReadAllText($f.FullName)
    if ($orig -notmatch 'console\s*\.\s*log\s*\(') { continue }
    $r = Quitar-ConsoleLog $orig
    if ($r.Cantidad -gt 0) {
        $totalLogs += $r.Cantidad
        Write-Host ("{0,4} console.log  {1}" -f $r.Cantidad, $f.FullName.Replace($raiz + '\', ''))
        if (-not $Simular) { [System.IO.File]::WriteAllText($f.FullName, $r.Texto, $utf8) }
    }
}

# ============ RESUMEN ============
$mb = [Math]::Round($bytes / 1MB, 2)
Write-Host ""
if ($Simular) {
    Write-Host "SIMULACION (no se modifico nada):" -ForegroundColor Yellow
    Write-Host "  Archivos a borrar: $borrados ($mb MB), omitidos: $omitidos"
    Write-Host "  console.log a quitar: $totalLogs"
} else {
    Write-Host "LISTO:" -ForegroundColor Green
    Write-Host "  Archivos borrados: $borrados ($mb MB), omitidos: $omitidos"
    Write-Host "  console.log quitados: $totalLogs"
}