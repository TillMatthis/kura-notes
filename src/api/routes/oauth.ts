/**
 * KURA Notes - OAuth 2.0 Routes
 *
 * Implements OAuth 2.0 authorization code flow with KOauth
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import { verifyJWT } from '../../lib/jwt-verifier.js';

/**
 * Session type augmentation for TypeScript
 */
declare module 'fastify' {
  interface Session {
    oauthState?: string;
    accessToken?: string;
    refreshToken?: string;
    user?: {
      id: string;
      email: string;
    };
  }
}

/**
 * Generate a cryptographically secure random string
 */
function generateRandomString(length: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * OAuth token response from KOauth
 */
interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  id_token?: string;
}

/**
 * Check if OAuth is configured
 */
function isOAuthConfigured(): boolean {
  return !!(config.oauthClientId && config.oauthClientSecret && config.oauthRedirectUri);
}

/**
 * Check if email is allowed to sign up
 * Returns true if no whitelist is configured (open signup)
 * Returns true if email is in the whitelist
 * Returns false if whitelist is configured but email is not in it
 */
function isEmailAllowed(email: string): boolean {
  // If no whitelist is configured, allow all emails
  if (!config.allowedEmails || config.allowedEmails.length === 0) {
    return true;
  }

  // Normalize email for comparison
  const normalizedEmail = email.trim().toLowerCase();

  // Check if email is in the whitelist
  return config.allowedEmails.includes(normalizedEmail);
}

/**
 * Register OAuth routes
 */
export async function registerOAuthRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /auth/login
   * Initiates OAuth 2.0 authorization code flow
   */
  fastify.get('/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.debug('Initiating OAuth login flow');

    // Check if OAuth is configured
    if (!isOAuthConfigured()) {
      logger.error('OAuth not configured - missing environment variables');
      return reply.status(503).send({
        error: 'OAuth not configured',
        message: 'OAuth 2.0 authentication is not configured. Please set OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, and OAUTH_REDIRECT_URI environment variables.',
        documentation: 'See docs/OAUTH_IMPLEMENTATION.md for setup instructions'
      });
    }

    // Generate CSRF protection state
    const state = generateRandomString(32);
    request.session.oauthState = state;

    // Build authorization URL
    const authUrl = new URL(`${config.koauthUrl}/oauth/authorize`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', config.oauthClientId!);
    authUrl.searchParams.set('redirect_uri', config.oauthRedirectUri!);
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('state', state);

    logger.info('Redirecting to OAuth authorization', {
      authUrl: authUrl.toString(),
      state,
    });

    return reply.redirect(authUrl.toString());
  });

  /**
   * GET /oauth/callback
   * Handles OAuth callback and exchanges authorization code for tokens
   */
  fastify.get('/oauth/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.debug('OAuth callback received');

    // Check if OAuth is configured
    if (!isOAuthConfigured()) {
      logger.error('OAuth not configured - cannot process callback');
      return reply.status(503).send({
        error: 'OAuth not configured',
        message: 'OAuth 2.0 authentication is not configured. Please set OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, and OAUTH_REDIRECT_URI environment variables.'
      });
    }

    const { code, state } = request.query as { code: string; state: string; error?: string };

    // Check for OAuth errors
    const error = (request.query as { error?: string }).error;
    if (error) {
      logger.error('OAuth authorization error', { error });
      return reply.status(400).send({
        error: 'OAuth authorization failed',
        details: error
      });
    }

    // Verify required parameters
    if (!code || !state) {
      logger.error('Missing required OAuth parameters', { code: !!code, state: !!state });
      return reply.status(400).send({ error: 'Missing authorization code or state' });
    }

    // Verify CSRF protection
    if (state !== request.session.oauthState) {
      logger.error('OAuth state mismatch', {
        received: state,
        expected: request.session.oauthState,
      });
      return reply.status(400).send({ error: 'Invalid state parameter (CSRF protection)' });
    }

    // Clear the state (single use)
    delete request.session.oauthState;

    try {
      // Exchange authorization code for tokens
      logger.debug('Exchanging authorization code for tokens');

      const tokenResponse = await fetch(`${config.koauthUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.oauthRedirectUri!,
          client_id: config.oauthClientId!,
          client_secret: config.oauthClientSecret!,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logger.error('Token exchange failed', {
          status: tokenResponse.status,
          error: errorText,
        });
        return reply.status(400).send({
          error: 'Token exchange failed',
          details: errorText
        });
      }

      const tokens = await tokenResponse.json() as OAuthTokenResponse;

      logger.debug('Tokens received successfully', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresIn: tokens.expires_in,
      });

      // Verify access token with RS256 signature and claim validation
      // SECURITY: This now performs proper signature verification using KOauth's public key
      const verifiedUser = await verifyJWT(tokens.access_token);

      if (!verifiedUser) {
        logger.error('Failed to verify access token');
        return reply.status(400).send({ error: 'Invalid token' });
      }

      const userId = verifiedUser.id;
      const userEmail = verifiedUser.email;

      // Check if email is allowed (whitelist check)
      if (!isEmailAllowed(userEmail)) {
        logger.warn('Signup attempt blocked by email whitelist', {
          email: userEmail,
          userId,
        });
        return reply.status(403).send({
          error: 'Access denied',
          message: 'Your email is not authorized to access this application. Please contact the administrator if you believe this is an error.',
        });
      }

      // Store tokens and user info in session
      request.session.accessToken = tokens.access_token;
      request.session.refreshToken = tokens.refresh_token;
      request.session.user = {
        id: userId,
        email: userEmail,
      };

      logger.info('OAuth login successful', {
        userId,
        email: userEmail,
      });

      // Redirect to application dashboard
      return reply.redirect('/');
    } catch (error) {
      logger.error('OAuth callback error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return reply.status(500).send({
        error: 'Internal server error during OAuth callback'
      });
    }
  });

  /**
   * GET /auth/logout
   * Logs out the user and clears session
   */
  fastify.get('/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.debug('Logout requested');

    // Destroy session
    request.session.destroy();

    // Redirect to KOauth logout to clear SSO session
    const logoutUrl = `${config.koauthUrl}/logout`;

    logger.info('User logged out, redirecting to KOauth logout');

    return reply.redirect(logoutUrl);
  });

  logger.info('OAuth routes registered');
}

/**
 * Refresh OAuth tokens
 * Called when access token expires
 */
export async function refreshOAuthToken(refreshToken: string): Promise<OAuthTokenResponse | null> {
  try {
    logger.debug('Refreshing OAuth tokens');

    // Check if OAuth is configured
    if (!config.oauthClientId || !config.oauthClientSecret) {
      logger.error('OAuth not configured - cannot refresh token');
      return null;
    }

    const response = await fetch(`${config.koauthUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.oauthClientId,
        client_secret: config.oauthClientSecret,
      }),
    });

    if (!response.ok) {
      logger.warn('Token refresh failed', { status: response.status });
      return null;
    }

    const tokens = await response.json() as OAuthTokenResponse;

    logger.debug('Tokens refreshed successfully');

    return tokens;
  } catch (error) {
    logger.error('Error refreshing OAuth tokens', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
