# Run a FreeCAD Python script headless (freecadcmd) with __file__ set, so scripts can find
# their own folder and the vendored freecad/fclib. Exits non-zero if the script raises. Windows only, FreeCAD 1.1 in its
# default folder; run.py does the same on any OS.
#
#   tools\fcrun.ps1 freecad\build.py
#
# The same script runs inside the GUI (MCP execute_code or the Python console) with:
#   p = r"D:/GitHub/lr4-sandbox/freecad/build.py"; exec(open(p, encoding="utf-8").read(), {"__file__": p, "__name__": "__main__"})
param(
    [Parameter(Mandatory = $true)][string]$Script
)
$freecadcmd = "C:\Program Files\FreeCAD 1.1\bin\freecadcmd.exe"
$path = (Resolve-Path $Script).Path -replace '\\', '/'
$code = "import sys, traceback`np = r'$path'`ntry:`n    exec(compile(open(p, encoding='utf-8').read(), p, 'exec'), {'__file__': p, '__name__': '__main__'})`nexcept SystemExit:`n    raise`nexcept BaseException:`n    traceback.print_exc()`n    open(p + '.failed', 'w').close()`n"
$marker = "$path.failed"
Remove-Item -LiteralPath $marker -ErrorAction SilentlyContinue
& $freecadcmd -c $code
if (Test-Path -LiteralPath $marker) {
    Remove-Item -LiteralPath $marker
    exit 1
}
exit $LASTEXITCODE
