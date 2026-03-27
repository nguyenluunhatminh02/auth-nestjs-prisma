import { Request } from 'express';

export interface RequestContext {
  ip: string;
  ua: string;
  device: string;
}

export function extractRequestContext(req: Request): RequestContext {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded
    ? (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim()
    : req.socket?.remoteAddress ?? 'unknown';
  const ua = (req.headers['user-agent'] as string) ?? '';
  return { ip, ua, device: parseDeviceInfo(ua) };
}

export function parseDeviceInfo(ua: string): string {
  if (!ua) return 'Unknown';
  if (/Mobile|Android(?!.*EdgA)/i.test(ua)) return 'Mobile';
  if (/Tablet|iPad/i.test(ua)) return 'Tablet';
  if (/Edg\//i.test(ua)) return 'Desktop / Edge';
  if (/Chrome/i.test(ua)) return 'Desktop / Chrome';
  if (/Firefox/i.test(ua)) return 'Desktop / Firefox';
  if (/Safari/i.test(ua)) return 'Desktop / Safari';
  return 'Desktop / Other';
}
