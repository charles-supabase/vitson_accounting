import "server-only";
import { execFile } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

// Asks Access itself to open the database and write one table (a linked table too) to a JSON file.
// Dates are written as yyyy-mm-dd, numbers as numbers, yes/no fields as true/false.
const EXPORT_SCRIPT = `param([string]$Db,[string]$Table,[string]$OutFile)
$ErrorActionPreference = 'Stop'
$inv = [System.Globalization.CultureInfo]::InvariantCulture
function ToJson([object]$v) {
  if ($null -eq $v -or $v -is [System.DBNull]) { return 'null' }
  if ($v -is [bool]) { if ($v) { return 'true' } else { return 'false' } }
  if ($v -is [datetime]) { return '"' + $v.ToString('yyyy-MM-dd', $inv) + '"' }
  if ($v -is [double] -or $v -is [single]) { return $v.ToString('R', $inv) }
  if ($v -is [byte] -or $v -is [int16] -or $v -is [int32] -or $v -is [int64] -or $v -is [decimal]) { return $v.ToString($inv) }
  $s = [string]$v
  $s = $s.Replace('\\', '\\\\').Replace('"', '\\"').Replace([string][char]13, '\\r').Replace([string][char]10, '\\n').Replace([string][char]9, '\\t')
  return '"' + $s + '"'
}
$app = $null
try {
  $app = New-Object -ComObject Access.Application
  $app.OpenCurrentDatabase($Db, $false)
  $dao = $app.CurrentDb()
  $rs = $dao.OpenRecordset("SELECT * FROM [$Table]", 4)
  $names = @()
  foreach ($f in $rs.Fields) { $names += $f.Name.Replace('\\', '\\\\').Replace('"', '\\"') }
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('[')
  $first = $true
  while (-not $rs.EOF) {
    $arr = $rs.GetRows(5000)
    $n = $arr.GetLength(1)
    for ($r = 0; $r -lt $n; $r++) {
      if (-not $first) { [void]$sb.Append(',') }
      $first = $false
      [void]$sb.Append('{')
      for ($c = 0; $c -lt $names.Count; $c++) {
        if ($c -gt 0) { [void]$sb.Append(',') }
        $v = $arr[$c, $r]
        [void]$sb.Append('"' + $names[$c] + '":' + (ToJson $v))
      }
      [void]$sb.Append('}')
    }
  }
  [void]$sb.Append(']')
  $rs.Close()
  $app.CloseCurrentDatabase()
  [System.IO.File]::WriteAllText($OutFile, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
} finally { if ($app) { $app.Quit() } }
Write-Output "OK"
`;

/** Reads a whole table, linked or not, through Access (Windows only; Access must be installed). */
export async function readTableViaAccess(path: string, table: string): Promise<Record<string, unknown>[]> {
  if (process.platform !== "win32") throw new Error("Linked tables can only be read when the app runs on Windows.");
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const psFile = join(tmpdir(), `vitson-export-${stamp}.ps1`);
  const outFile = join(tmpdir(), `vitson-export-${stamp}.json`);
  await writeFile(psFile, EXPORT_SCRIPT, "utf8");
  try {
    await run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psFile, path, table, outFile], {
      timeout: 600000,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
    return JSON.parse(await readFile(outFile, "utf8")) as Record<string, unknown>[];
  } catch (e: any) {
    const first = String(e?.stderr || e?.message || e).trim().split("\n")[0];
    throw new Error(first || "unknown error");
  } finally {
    await unlink(psFile).catch(() => {});
    await unlink(outFile).catch(() => {});
  }
}
