param([Parameter(Mandatory = $true)][string]$LiteralPath)
$ErrorActionPreference = 'Stop'
$signature = Get-AuthenticodeSignature -LiteralPath $LiteralPath
$signerHash = $null
if ($null -ne $signature.SignerCertificate) {
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $signerHash = [System.BitConverter]::ToString($sha256.ComputeHash($signature.SignerCertificate.RawData)).Replace('-', '').ToLowerInvariant()
  } finally { $sha256.Dispose() }
}
@{
  status = [string]$signature.Status
  signerSha256 = $signerHash
  timestamped = $null -ne $signature.TimeStamperCertificate
} | ConvertTo-Json -Compress
