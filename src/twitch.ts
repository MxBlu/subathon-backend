import * as crypto from "crypto";
import { IncomingHttpHeaders } from "http";
import fetch, { RequestInit } from 'node-fetch';

import { refreshToken, retrieveToken, StoredToken } from "./auth.js";
import { TWITCH_CLIENT_ID } from './constants.js';
import { Logger } from "./util/logger.js";

/*
  Twitch API client
*/

export const TWITCH_MESSAGE_ID = 'twitch-eventsub-message-id';
export const TWITCH_MESSAGE_TIMESTAMP = 'twitch-eventsub-message-timestamp';
export const TWITCH_MESSAGE_SIGNATURE = 'twitch-eventsub-message-signature';

// https://dev.twitch.tv/docs/api/reference#get-users
export interface GETUsersResponse {
  data: { 
    id: string;
    login: string;
    display_name: string;
    type: string;
    broadcaster_type: string;
    description: string;
    profile_image_url: string;
    offline_image_url: string;
    view_count: number;
    email: string;
    created_at: string;
  }[];
}

// https://dev.twitch.tv/docs/api/reference#get-eventsub-subscriptions
export interface GETEventSubResponse {
  data: APIEventSubscription[];
  total: number;
  total_cost: number;
  max_total_cost: number;
  pagination: {
    cursor: string;
  }
}

// https://dev.twitch.tv/docs/api/reference#create-eventsub-subscription
export interface POSTEventSubRequest {
  type: string;
  version: string;
  condition: APIEventSubCondition;
  transport: APIEventSubTransport;
}

// https://dev.twitch.tv/docs/api/reference#create-eventsub-subscription
export interface POSTEventSubResponse {
  data: APIEventSubscription[],
  total: number;
  total_cost: number;
  max_total_cost: number;
}

export interface WebhookEventRequest {
  subscription: APIEventSubscription;
  event: unknown;
  challenge?: string;
}

interface APIEventSubscription {
  id: string;
  status: string;
  type: string;
  version: string;
  condition: APIEventSubCondition;
  created_at: string;
  transport: APIEventSubTransport;
  cost: number;
}

// https://dev.twitch.tv/docs/eventsub/eventsub-reference#conditions
// Just the ones we care - follow, subscribe, gift, bits
interface APIEventSubCondition {
  broadcaster_user_id?: string;
}

// https://dev.twitch.tv/docs/eventsub/eventsub-reference#transport
interface APIEventSubTransport {
  method: "webhook";
  callback: string;
  secret?: string;
}

class AuthorizationError extends Error {
}

// Global app credentials - needed for webhook API calls
let appToken = null;

export async function initialiseAppToken(): Promise<void> {
  const logger = new Logger("AppTokenInit")
  appToken = await retrieveToken();
  logger.info('App token loaded');
}

export async function cleanupOldWebhooks(): Promise<void> {
  const logger = new Logger("WebhookCleanup");
  // Get app access token client
  const client = new TwitchAPIClient();

  // Get all webhooks present
  const webhooks: string[] = [];
  let cursor: string = null;
  do {
    const getEventSubResponse = await client.getEventSubSubscriptions(cursor);
    // Add all webhook ids to the list
    getEventSubResponse.data.forEach(esr => webhooks.push(esr.id));
    // Set the cursor if present
    cursor = getEventSubResponse.pagination?.cursor;
  } while (cursor != null);

  logger.debug(`${webhooks.length} webhooks to delete`);
  
  // Delete all webhooks
  for (const webhookId of webhooks) {
    await client.deleteEventSubSubscription(webhookId);
    logger.debug(`Deleted webhook ${webhookId}`);
  }
}

// Build the message used to get the HMAC
function getHmacMessage(rawBody: string, headers: IncomingHttpHeaders): string {
  return headers[TWITCH_MESSAGE_ID] as string + 
      headers[TWITCH_MESSAGE_TIMESTAMP] as string + 
      rawBody;
}

// Get the HMAC for a given message and secret
function getHmac(secret: string, message: string): string {
  return "sha256=" + crypto.createHmac('sha256', secret)
    .update(message)
    .digest('hex');
}

export class TwitchAPIClient {

  // Returns true if message matches expected HMAC
  public static validateRequest(rawBody: string, headers: IncomingHttpHeaders, 
      secret: string): boolean {
    // Compute HMAC
    const hmacMessage = getHmacMessage(rawBody, headers);
    const hmac = getHmac(secret, hmacMessage);
    // Get expected HMAC from headers
    const messageSignature = headers[TWITCH_MESSAGE_SIGNATURE] as string;
    // Compare HMAC values
    return crypto.timingSafeEqual(
      Buffer.from(hmac), Buffer.from(messageSignature));
  }

  logger: Logger;

  token: StoredToken;

  constructor(token?: StoredToken) {
    this.logger = new Logger("TwitchAPIClient");
    // Use provided token if present
    if (token != null) {
      this.token = token;
    } else {
      // Otherwise use the global app token
      this.token = appToken;
    }
  }

  // Identify the current user with the Twitch API
  public async identifyUser(): Promise<GETUsersResponse> {
    return await this.call('/users', 'GET') as GETUsersResponse;
  }

  public async getEventSubSubscriptions(cursor?: string): Promise<GETEventSubResponse> {
    let url = '/eventsub/subscriptions';
    if (cursor != null) {
      url += `?after=${cursor}`;
    }
    return await this.call(url, 'GET') as GETEventSubResponse;
  }

  // Create a new EventSub subscription on the Twitch API
  public async createEventSubSubscription(type: string, userId: string, 
      callbackUrl: string, secret: string): Promise<POSTEventSubResponse> {
    return await this.call('/eventsub/subscriptions', 'POST', 
      JSON.stringify({
        type: type,
        version: "1",
        condition: {
          broadcaster_user_id: userId
        },
        transport: {
          method: "webhook",
          callback: callbackUrl,
          secret: secret
        }
      })) as POSTEventSubResponse;
  }

  // Delete an EventSub subscription on the Twitch API
  public async deleteEventSubSubscription(subscriptionId: string): Promise<void> {
    await this.call(`/eventsub/subscriptions?id=${subscriptionId}`, 'DELETE');
  }

  // Make a GET request to the Twitch API
  private async call(endpoint: string, method: string, 
      body: string | URLSearchParams = null): Promise<unknown> {
    // Ensure token is still valid
    if (! await this.validate()) {
      // If not, try a refresh first
      this.token = await refreshToken(this.token);
    }
    // If we're still unable to get a valid token, give up
    if (this.token == null) {
      throw new AuthorizationError("Token invalidated");
    }
    // Setup request options
    const reqOptions: RequestInit = {
      method: method,
      headers: {
        "Authorization": `Bearer ${this.token.token}`,
        "Client-Id": TWITCH_CLIENT_ID
      }
    };
    // If the body is present, add to request
    if (body != null) {
      reqOptions.body = body;
    }
    // If the body is a string, assume it's JSON and add Content-Type
    if (typeof body == 'string') {
      reqOptions.headers['Content-Type'] = "application/json";
    }
    // Do the request
    const response = await fetch(`https://api.twitch.tv/helix${endpoint}`, reqOptions);
    // If the request returned a bad response, return null;
    if (!response.ok) {
      this.logger.error(`Fetch failed: ${response.status} - ${await response.text()}`);
      return null;
    }
    // Finally return the JSON response, if there is one to give
    const respBody = await response.text();
    if (respBody.length > 0) {
      return JSON.parse(respBody);
    } else {
      return null;
    }
  }

  // Ensure we're still logged in
  private async validate(): Promise<boolean> {
    // Attempt to fetch the validate endpoint
    const response = await fetch("https://id.twitch.tv/oauth2/validate", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.token.token}`
      }
    });

    // If the status is 200, we're good
    return response.ok;
  }
}