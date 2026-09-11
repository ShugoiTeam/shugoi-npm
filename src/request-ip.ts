export interface PeerRequest {
  ip?: string;
  socket?: { remoteAddress?: string };
  raw?: { socket?: { remoteAddress?: string } };
}

/** Forwarding policy belongs to the HTTP framework or the trusted ingress. */
export function requestIp(request: PeerRequest): string {
  return request.ip || request.socket?.remoteAddress || request.raw?.socket?.remoteAddress || 'unknown';
}
