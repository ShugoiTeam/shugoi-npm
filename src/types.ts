export interface CheckResponse {
  allowed?: boolean;
  blocked?: boolean;
  blocked_reason?: string;
  remaining?: number;
  limit?: number;
  resetAt?: number;
  risk?: 'low' | 'medium' | 'high';
  reason?: string;
  captcha?: { challenge: string; difficulty: number };
  error?: string;
  requestId?: string;
}

export interface CheckRequest {
  siteKey: string;
  action: string;
  fingerprint: { machineId?: string; browser?: string };
  signals?: Record<string, unknown>;
  captchaToken?: string;
  passToken?: string;
  metadata?: { ip?: string; email?: string };
  blockRisk?: number;
}
