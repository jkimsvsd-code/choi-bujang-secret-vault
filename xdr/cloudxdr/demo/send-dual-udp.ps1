param([string]$SourceAddress='10.20.99.250', [ValidateRange(0,65535)][int]$DestinationPort=5353)
$ErrorActionPreference='Stop'
$eventId='udp-demo-'+[Guid]::NewGuid().ToString('N')
$record=@{
  kesev_kind='network'; event_id=$eventId; srcip=$SourceAddress; dstip='10.20.99.10'
  srcport=53000; dstport=$DestinationPort; protocol='UDP'; action='deny'
}
$body=$record | ConvertTo-Json -Compress
$stamp=(Get-Date).ToString('MMM dd HH:mm:ss',[Globalization.CultureInfo]::InvariantCulture)
$wire='<134>'+$stamp+' kesev-soc-01 cxdr-fw: '+$body
$udp=New-Object Net.Sockets.UdpClient
try {
  $bytes=[Text.Encoding]::UTF8.GetBytes($wire)
  foreach($target in @('10.20.99.10','10.20.99.250')){
    [void]$udp.Send($bytes,$bytes.Length,$target,5514)
    "UDP syslog sent to {0}:5514" -f $target
  }
} finally { $udp.Dispose() }
"Event ID: $eventId"
