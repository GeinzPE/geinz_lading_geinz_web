param([switch]$Simular)   # con -Simular solo cuenta, no modifica nada

$utf8    = New-Object System.Text.UTF8Encoding($false)
$patron  = [regex]'console\s*\.\s*log\s*\('
$total   = 0

function Quitar-ConsoleLog([string]$t) {
    $sb  = New-Object System.Text.StringBuilder
    $pos = 0
    $cant = 0
    while ($true) {
        $m = $patron.Match($t, $pos)
        if (-not $m.Success) { break }

        # Buscar el paréntesis que cierra (respeta textos entre comillas y `plantillas`)
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
        if ($prof -ne 0) {   # no se pudo cerrar: lo dejo tal cual
            $sb.Append($t.Substring($pos, $m.Index + $m.Length - $pos)) | Out-Null
            $pos = $m.Index + $m.Length
            continue
        }
        $fin = $i

        # ¿El console.log ocupa toda la línea?
        $ini   = $t.LastIndexOf("`n", [Math]::Max(0, $m.Index - 1)) + 1
        if ($m.Index -eq 0) { $ini = 0 }
        $antes = $t.Substring($ini, $m.Index - $ini)

        $j = $fin
        while ($j -lt $t.Length -and ($t[$j] -eq ' ' -or $t[$j] -eq "`t")) { $j++ }
        if ($j -lt $t.Length -and $t[$j] -eq ';') { $j++ }
        while ($j -lt $t.Length -and ($t[$j] -eq ' ' -or $t[$j] -eq "`t")) { $j++ }
        $finLinea = ($j -ge $t.Length) -or ($t[$j] -eq "`r") -or ($t[$j] -eq "`n")

        if ($antes -match '^\s*$' -and $finLinea -and $ini -ge $pos) {
            # Revisar si es el cuerpo de un if/else sin llaves (borrarlo rompería el código)
            $k = $ini - 1
            while ($k -ge 0 -and [char]::IsWhiteSpace($t[$k])) { $k-- }
            $previo = if ($k -ge 0) { $t.Substring([Math]::Max(0, $k - 3), [Math]::Min(4, $k + 1)) } else { '' }
            $necesitaPuntoYComa = $previo.EndsWith(')') -or $previo.EndsWith('else') -or $previo.EndsWith('=>')

            $sb.Append($t.Substring($pos, $ini - $pos)) | Out-Null
            if ($necesitaPuntoYComa) {
                $sb.Append($antes + ';') | Out-Null
                $pos = $j
            } else {
                if ($j -lt $t.Length -and $t[$j] -eq "`r") { $j++ }
                if ($j -lt $t.Length -and $t[$j] -eq "`n") { $j++ }
                $pos = $j
            }
        }
        else {
            # Está dentro de otra expresión (=> console.log(x), if (a) console.log(b), etc.)
            $sb.Append($t.Substring($pos, $m.Index - $pos)) | Out-Null
            $sb.Append('void 0') | Out-Null
            $pos = $fin
        }
        $cant++
    }
    $sb.Append($t.Substring($pos)) | Out-Null
    return @{ Texto = $sb.ToString(); Cantidad = $cant }
}

$archivos = Get-ChildItem -Path . -Recurse -File -Include *.js, *.mjs, *.html |
    Where-Object {
        $_.FullName -notmatch '\\(node_modules|\.git)\\' -and
        $_.Name -notlike '*.min.js'
    }

foreach ($f in $archivos) {
    $orig = [System.IO.File]::ReadAllText($f.FullName)
    if ($orig -notmatch 'console\s*\.\s*log\s*\(') { continue }

    $r = Quitar-ConsoleLog $orig
    if ($r.Cantidad -gt 0) {
        $total += $r.Cantidad
        Write-Host ("{0,4}  {1}" -f $r.Cantidad, $f.FullName.Replace((Get-Location).Path + '\', ''))
        if (-not $Simular) {
            [System.IO.File]::WriteAllText($f.FullName, $r.Texto, $utf8)
        }
    }
}

if ($Simular) { Write-Host "`nSIMULACIÓN: se quitarían $total console.log (no se modificó nada)." -ForegroundColor Yellow }
else          { Write-Host "`nListo: se quitaron $total console.log." -ForegroundColor Green }