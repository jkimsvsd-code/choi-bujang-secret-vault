import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

// Both the direct receiver and Manager forwarding use the same canonical bytes.
export function parseNativeSyslog(text, deviceIp) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 8192 || typeof deviceIp !== 'string' || !isIP(deviceIp)) return null;
  const raw = text.replace(/^<\d{1,3}>/, '').trim();
  const eventId = 'native-' + createHash('sha256').update(raw).digest('hex');
  const cisco = /%(LINK|LINEPROTO|SYS)-([0-7])-([A-Z0-9_]+):\s*(.+)/.exec(raw);
  if (cisco && (cisco[1] !== 'SYS' || cisco[3] === 'CONFIG_I')) {
    return {
      kind:'device', eventId, srcip:deviceIp, deviceIp, vendor:'Cisco IOS',
      eventCode:cisco[1] + '-' + cisco[2] + '-' + cisco[3], severity:Number(cisco[2]),
      summary:cisco[4].replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 512),
    };
  }
  const filterlog = /\bfilterlog(?:\[\d+\])?:\s*(.*)/.exec(raw);
  if (!filterlog) return null;
  const fields = filterlog[1].split(',');
  if (fields[8] !== '4' || !isIP(fields[18] ?? '') || !isIP(fields[19] ?? '') ||
      !['tcp','udp'].includes(fields[16]) || !['pass','block'].includes(fields[6]) ||
      !/^\d{1,5}$/.test(fields[20] ?? '') || !/^\d{1,5}$/.test(fields[21] ?? '') ||
      Number(fields[20]) > 65535 || Number(fields[21]) > 65535) return null;
  return {
    kind:'network', eventId, srcip:fields[18], dstip:fields[19],
    srcport:Number(fields[20]), dstport:Number(fields[21]),
    protocol:fields[16].toUpperCase(), action:fields[6] === 'block' ? 'deny' : 'allow',
    deviceIp, vendor:'pfSense', interface:fields[4], direction:fields[7], tracker:fields[3],
    eventCode:'filterlog', summary:'pfSense ' + fields[6] + ' ' + fields[16].toUpperCase(),
  };
}
