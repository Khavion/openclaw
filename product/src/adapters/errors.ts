// Typed adapter errors. Callers switch on `kind` instead of parsing messages.

export type AdapterErrorKind = 'auth' | 'rate_limit' | 'http' | 'validation' | 'network';

export class AdapterError extends Error {
  readonly kind: AdapterErrorKind;
  readonly provider: 'ghl' | 'stripe';
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(opts: {
    kind: AdapterErrorKind;
    provider: 'ghl' | 'stripe';
    message: string;
    status?: number;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(opts.message, { cause: opts.cause });
    this.name = 'AdapterError';
    this.kind = opts.kind;
    this.provider = opts.provider;
    this.status = opts.status;
    this.retryable = opts.retryable ?? (opts.kind === 'rate_limit' || opts.kind === 'network');
  }
}

export function classifyHttpStatus(
  provider: 'ghl' | 'stripe',
  status: number,
  body: string
): AdapterError {
  const message = `${provider} HTTP ${status}: ${body.slice(0, 300)}`;
  if (status === 401 || status === 403) {
    return new AdapterError({ kind: 'auth', provider, message, status, retryable: false });
  }
  if (status === 429) {
    return new AdapterError({ kind: 'rate_limit', provider, message, status, retryable: true });
  }
  return new AdapterError({
    kind: 'http',
    provider,
    message,
    status,
    retryable: status >= 500
  });
}
