// RealGhlClient: live HighLevel API 2.0 client. Read-only by design.
//
// Every endpoint below is cited to the official OpenAPI specs at
// https://github.com/GoHighLevel/highlevel-api-docs (fetched 2026-07-02) and
// the OAuth guide:
// https://github.com/GoHighLevel/highlevel-api-docs/blob/main/docs/oauth/Authorization.md
//
// Auth model (agency-level marketplace app):
//   1. Authorization Code -> agency ("Company") access token, POST /oauth/token.
//   2. Access tokens live 1 day; refresh with grant_type=refresh_token.
//   3. Location-scoped endpoints (invoices, transactions) need a location
//      token minted from the agency token via POST /oauth/locationToken.
// Rate limit: burst 100 req / 10 s per app per resource (docs above); the
// design doc pins SaaS endpoints at 10 rps, enforced by RateLimiter.

import { AdapterError, classifyHttpStatus } from '../errors.js';
import { RateLimiter, ghlRateLimiter } from '../rateLimiter.js';
import {
  AgencyPlansResponseSchema,
  ListInvoicesResponseSchema,
  ListTxnsResponseSchema,
  LocationSubscriptionDtoSchema,
  SaasLocationsResponseSchema,
  TokenResponseSchema,
  normalizeAgencyPlan,
  normalizeInvoice,
  normalizeLocationSubscription,
  normalizeSaasLocation,
  normalizeTransaction,
  type TokenResponse
} from './schemas.js';
import type {
  AgencyPlan,
  GhlClient,
  GhlInvoice,
  GhlTransaction,
  LocationSubscription,
  SaasLocation
} from './types.js';

// Base URL: every module spec declares servers[0].url = https://services.leadconnectorhq.com
// (apps/oauth.json, apps/saas-api.json, apps/payments.json, apps/invoices.json).
const BASE_URL = 'https://services.leadconnectorhq.com';

// Version headers are enum-locked per module in the specs (fetched 2026-07-02):
//   saas-api.json  -> "2021-04-15"
//   payments.json  -> "2021-07-28"
//   invoices.json  -> "2021-07-28"
//   oauth.json (locationToken) -> "2021-07-28"
const SAAS_VERSION = '2021-04-15';
const GENERAL_VERSION = '2021-07-28';

export interface GhlTokens {
  accessToken: string;
  refreshToken: string;
  /** epoch ms when accessToken expires */
  expiresAt: number;
  /**
   * Agency (Company) id, present on Company-token exchange responses
   * (apps/oauth.json GetAccessCodeSuccessfulResponseDto.companyId).
   */
  companyId?: string;
}

export interface RealGhlClientOptions {
  clientId: string;
  clientSecret: string;
  tokens: GhlTokens;
  /** Called whenever tokens rotate, so the caller can persist them. */
  onTokensRefreshed?: (tokens: GhlTokens) => Promise<void> | void;
  fetchImpl?: typeof fetch;
  limiter?: RateLimiter;
}

export class RealGhlClient implements GhlClient {
  private tokens: GhlTokens;
  private readonly fetchImpl: typeof fetch;
  private readonly limiter: RateLimiter;
  private locationTokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(private readonly opts: RealGhlClientOptions) {
    this.tokens = opts.tokens;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.limiter = opts.limiter ?? ghlRateLimiter();
  }

  // --- OAuth -------------------------------------------------------------

  /**
   * Exchange an authorization code for tokens.
   * POST /oauth/token, application/x-www-form-urlencoded, body fields
   * client_id, client_secret, grant_type=authorization_code, code, user_type,
   * redirect_uri (apps/oauth.json GetAccessCodebodyDto).
   */
  static async exchangeAuthCode(params: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
    userType: 'Company' | 'Location';
    fetchImpl?: typeof fetch;
  }): Promise<TokenResponse> {
    const f = params.fetchImpl ?? fetch;
    const res = await f(`${BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: params.clientId,
        client_secret: params.clientSecret,
        grant_type: 'authorization_code',
        code: params.code,
        user_type: params.userType,
        redirect_uri: params.redirectUri
      })
    });
    const text = await res.text();
    if (!res.ok) throw classifyHttpStatus('ghl', res.status, text);
    return TokenResponseSchema.parse(JSON.parse(text));
  }

  /**
   * Refresh the agency access token.
   * POST /oauth/token with grant_type=refresh_token (apps/oauth.json; access
   * tokens are valid 1 day, refresh tokens 1 year — docs/oauth/Authorization.md FAQs).
   */
  private async refreshAccessToken(): Promise<void> {
    const res = await this.fetchImpl(`${BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: this.tokens.refreshToken,
        user_type: 'Company'
      })
    });
    const text = await res.text();
    if (!res.ok) throw classifyHttpStatus('ghl', res.status, text);
    const parsed = TokenResponseSchema.parse(JSON.parse(text));
    this.tokens = {
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token ?? this.tokens.refreshToken,
      expiresAt: Date.now() + parsed.expires_in * 1000
    };
    await this.opts.onTokensRefreshed?.(this.tokens);
  }

  private async agencyToken(): Promise<string> {
    // Refresh 60s before expiry to avoid mid-request 401s.
    if (Date.now() > this.tokens.expiresAt - 60_000) {
      await this.refreshAccessToken();
    }
    return this.tokens.accessToken;
  }

  /**
   * Mint a location token from the agency token.
   * POST /oauth/locationToken, Version 2021-07-28, JSON body
   * { companyId, locationId }; requires scope oauth.write
   * (apps/oauth.json GetLocationAccessCodeBodyDto + docs/oauth/Scopes.md).
   */
  private async locationToken(companyId: string, locationId: string): Promise<string> {
    const cached = this.locationTokens.get(locationId);
    if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;

    await this.limiter.acquire();
    const res = await this.fetchImpl(`${BASE_URL}/oauth/locationToken`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.agencyToken()}`,
        Version: GENERAL_VERSION,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ companyId, locationId })
    });
    const text = await res.text();
    if (!res.ok) throw classifyHttpStatus('ghl', res.status, text);
    const parsed = TokenResponseSchema.parse(JSON.parse(text));
    const entry = { token: parsed.access_token, expiresAt: Date.now() + parsed.expires_in * 1000 };
    this.locationTokens.set(locationId, entry);
    return entry.token;
  }

  // --- Generic GET with retry-once-on-401 ---------------------------------

  private async getJson(
    url: string,
    headers: Record<string, string>,
    retried = false
  ): Promise<unknown> {
    await this.limiter.acquire();
    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers });
    } catch (cause) {
      throw new AdapterError({
        kind: 'network',
        provider: 'ghl',
        message: `network failure calling ${url}`,
        cause
      });
    }
    const text = await res.text();
    if (res.status === 401 && !retried) {
      await this.refreshAccessToken();
      return this.getJson(
        url,
        { ...headers, Authorization: `Bearer ${this.tokens.accessToken}` },
        true
      );
    }
    if (!res.ok) throw classifyHttpStatus('ghl', res.status, text);
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new AdapterError({
        kind: 'validation',
        provider: 'ghl',
        message: `non-JSON response from ${url}`,
        cause
      });
    }
  }

  private async agencyHeaders(version: string): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${await this.agencyToken()}`, Version: version };
  }

  // --- Read surface --------------------------------------------------------

  /**
   * GET /saas-api/public-api/saas-locations/{companyId}?page=N
   * Paginated via pagination.hasNext (apps/saas-api.json
   * GetSaasLocationsResponseDto). Requires agency token.
   */
  async listSaasLocations(companyId: string): Promise<SaasLocation[]> {
    const out: SaasLocation[] = [];
    for (let page = 1; ; page++) {
      const raw = SaasLocationsResponseSchema.parse(
        await this.getJson(
          `${BASE_URL}/saas-api/public-api/saas-locations/${encodeURIComponent(companyId)}?page=${page}`,
          await this.agencyHeaders(SAAS_VERSION)
        )
      );
      out.push(...raw.locations.map(normalizeSaasLocation));
      if (!raw.pagination.hasNext) break;
    }
    return out;
  }

  /**
   * GET /saas-api/public-api/agency-plans/{companyId}
   * Returns AgencyPlanResponseDto[] (apps/saas-api.json). Agency token.
   */
  async getAgencyPlans(companyId: string): Promise<AgencyPlan[]> {
    const raw = AgencyPlansResponseSchema.parse(
      await this.getJson(
        `${BASE_URL}/saas-api/public-api/agency-plans/${encodeURIComponent(companyId)}`,
        await this.agencyHeaders(SAAS_VERSION)
      )
    );
    return raw.map(normalizeAgencyPlan);
  }

  /**
   * GET /saas-api/public-api/get-saas-subscription/{locationId}?companyId=...
   * (apps/saas-api.json LocationSubscriptionResponseDto). Agency token.
   */
  async getLocationSubscription(
    companyId: string,
    locationId: string
  ): Promise<LocationSubscription> {
    const raw = LocationSubscriptionDtoSchema.parse(
      await this.getJson(
        `${BASE_URL}/saas-api/public-api/get-saas-subscription/${encodeURIComponent(locationId)}?companyId=${encodeURIComponent(companyId)}`,
        await this.agencyHeaders(SAAS_VERSION)
      )
    );
    return normalizeLocationSubscription(raw);
  }

  /**
   * GET /invoices/?altId={locationId}&altType=location&limit&offset
   * altId/altType/limit/offset are required (apps/invoices.json); scope
   * invoices.readonly; Version 2021-07-28. Location token.
   */
  async listLocationInvoices(locationId: string): Promise<GhlInvoice[]> {
    const companyId = await this.companyIdFor(locationId);
    const token = await this.locationToken(companyId, locationId);
    const limit = 100;
    const out: GhlInvoice[] = [];
    for (let offset = 0; ; offset += limit) {
      const raw = ListInvoicesResponseSchema.parse(
        await this.getJson(
          `${BASE_URL}/invoices/?altId=${encodeURIComponent(locationId)}&altType=location&limit=${limit}&offset=${offset}`,
          { Authorization: `Bearer ${token}`, Version: GENERAL_VERSION }
        )
      );
      out.push(...raw.invoices.map(normalizeInvoice));
      if (offset + limit >= raw.total || raw.invoices.length === 0) break;
    }
    return out;
  }

  /**
   * GET /payments/transactions?altId={locationId}&altType=location&limit&offset
   * altId/altType required (apps/payments.json); scope
   * payments/transactions.readonly; Version 2021-07-28. Location token.
   */
  async listLocationTransactions(locationId: string): Promise<GhlTransaction[]> {
    const companyId = await this.companyIdFor(locationId);
    const token = await this.locationToken(companyId, locationId);
    const limit = 100;
    const out: GhlTransaction[] = [];
    for (let offset = 0; ; offset += limit) {
      const raw = ListTxnsResponseSchema.parse(
        await this.getJson(
          `${BASE_URL}/payments/transactions?altId=${encodeURIComponent(locationId)}&altType=location&limit=${limit}&offset=${offset}`,
          { Authorization: `Bearer ${token}`, Version: GENERAL_VERSION }
        )
      );
      out.push(...raw.data.map(normalizeTransaction));
      if (offset + limit >= raw.totalCount || raw.data.length === 0) break;
    }
    return out;
  }

  // companyId is stable per install; it arrives on the Company-token
  // exchange response (apps/oauth.json GetAccessCodeSuccessfulResponseDto).
  private async companyIdFor(_locationId: string): Promise<string> {
    const companyId = this.tokens.companyId ?? this.opts.tokens.companyId;
    if (companyId) return companyId;
    throw new AdapterError({
      kind: 'validation',
      provider: 'ghl',
      message:
        'companyId unknown: construct RealGhlClient with tokens carrying companyId (from the OAuth exchange response)'
    });
  }
}
