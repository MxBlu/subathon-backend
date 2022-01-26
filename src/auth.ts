import fetch from 'node-fetch';

import { OAUTH_REDIRECT_URI, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } from "./constants.js";
import { Logger } from './util/logger.js';

/*
  Authorization helper functions/classes/interfaces
*/

const logger = new Logger("Auth");

// Response object when retrieving an OAuth token
interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

// Storage class for the OAuth token
export class StoredToken {
  // OAuth access token
  token: string;
  // OAuth refresh token
  refreshToken: string;
  // Expiry date for the token
  expiry: Date;

  constructor(accessTokenResponse: OAuthTokenResponse) {
    this.token = accessTokenResponse.access_token;
    this.refreshToken = accessTokenResponse.refresh_token;
    // Compute expiry from token duration
    this.expiry = new Date();
    this.expiry.setSeconds(this.expiry.getSeconds() + accessTokenResponse.expires_in);
  }

  // Essentially the constructor - but allows us to change mutate the existing token
  public refresh(refreshTokenResponse: OAuthTokenResponse): void {
    this.token = refreshTokenResponse.access_token;
    this.refreshToken = refreshTokenResponse.refresh_token;
    // Compute expiry from token duration
    this.expiry = new Date();
    this.expiry.setSeconds(this.expiry.getSeconds() + refreshTokenResponse.expires_in);
  }
}

// Retrieve an access token
// Provides a user access token if authorizationCode is present, otherwise provides an app access token
export async function retrieveToken(authorizationCode?: string): Promise<StoredToken> {
  // Try and get the a token with this code
  const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: generateTokenParams(authorizationCode)
  });
  
  if (tokenResponse.ok) {
    // Parse token from response
    const token = (await tokenResponse.json()) as OAuthTokenResponse;
    logger.trace(`Successfully retreived token: ${token.access_token}`)
    // Create and return a new StoredToken
    const storedToken = new StoredToken(token);
    return storedToken;
  } else {
    // If the response wasn't ok, something's wrong...
    logger.error(`OAuth token request failed: Status ${tokenResponse.status} - ${await tokenResponse.text()}`);
    return null;
  }
}

export async function refreshToken(storedToken: StoredToken): Promise<StoredToken> {
  // Try and get the a new token
  const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: generateRefreshParams(storedToken.refreshToken)
  });
  
  if (tokenResponse.ok) {
    // Parse token from response
    const token = (await tokenResponse.json()) as OAuthTokenResponse;
    // Refresh the existing token and return
    storedToken.refresh(token);
    return storedToken;
  } else {
    // If the response wasn't ok, something's wrong...
    logger.error(`OAuth token refresh failed: Status ${tokenResponse.status} - ${await tokenResponse.text()}`);
    return null;
  }
}

function generateTokenParams(code?: string): URLSearchParams {
  // Generate the request parameters
  const params = new URLSearchParams();
  params.set('client_id', TWITCH_CLIENT_ID);
  params.set('client_secret', TWITCH_CLIENT_SECRET);
  // If a code is present, do as authorization_code flow
  if (code != null) {
    params.set('grant_type', 'authorization_code');
    params.set('code', code);
    params.set('redirect_uri', OAUTH_REDIRECT_URI);
  } else {
    params.set('grant_type', 'client_credentials');
  }

  return params;
}

function generateRefreshParams(refreshToken: string): URLSearchParams {
  // Generate the request parameters
  const params = new URLSearchParams();
  params.set('client_id', TWITCH_CLIENT_ID);
  params.set('client_secret', TWITCH_CLIENT_SECRET);
  params.set('grant_type', 'refresh_token');
  params.set('refresh_token', refreshToken);

  return params;
}