param(
  [Parameter(Mandatory = $true)]
  [string]$ExePath
)

$resolvedPath = (Resolve-Path -LiteralPath $ExePath -ErrorAction Stop).Path
$bytes = [System.IO.File]::ReadAllBytes($resolvedPath)

if ($bytes.Length -lt 256 -or $bytes[0] -ne 0x4D -or $bytes[1] -ne 0x5A) {
  throw "文件不是有效的 Windows PE 可执行文件：$resolvedPath"
}

$peOffset = [BitConverter]::ToInt32($bytes, 0x3C)
if ($peOffset -lt 0 -or ($peOffset + 96) -ge $bytes.Length) {
  throw "Windows PE 头偏移无效：$resolvedPath"
}

if ($bytes[$peOffset] -ne 0x50 -or $bytes[$peOffset + 1] -ne 0x45) {
  throw "未找到 Windows PE 签名：$resolvedPath"
}

$optionalHeaderOffset = $peOffset + 24
$magic = [BitConverter]::ToUInt16($bytes, $optionalHeaderOffset)
if ($magic -ne 0x10B -and $magic -ne 0x20B) {
  throw ('不支持的 PE Optional Header：0x{0:X}' -f $magic)
}

$subsystem = [BitConverter]::ToUInt16($bytes, $optionalHeaderOffset + 68)
$subsystemNames = @{
  2 = 'Windows GUI'
  3 = 'Windows Console'
}
$name = if ($subsystemNames.ContainsKey([int]$subsystem)) { $subsystemNames[[int]$subsystem] } else { 'Other' }

Write-Output "文件：$resolvedPath"
Write-Output "PE 子系统：$subsystem ($name)"

if ($subsystem -ne 2) {
  throw "发布版不是 Windows GUI 子系统，双击启动时仍可能出现控制台窗口。"
}

Write-Output '验证通过：该 EXE 双击启动时不会创建 CMD/控制台窗口。'