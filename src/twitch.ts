import fetch, { RequestInit } from 'node-fetch';

import { refreshToken, retrieveToken, StoredToken } from "./auth.js";
import { TWITCH_CLIENT_ID } from './constants.js';
import { Logger } from "./util/logger.js";

/*
  Twitch API client
*/

// https://dev.twitch.tv/docs/api/reference#get-users
export interface GETUsersResponse {
  data: [
    { 
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
    }
  ]
}

// https://dev.twitch.tv/docs/api/reference#get-eventsub-subscriptions
export interface GETEventSubResponse {
  data: [
    {
      id: string;
      status: string;
      type: string;
      version: string;
      condition: APIEventSubCondition;
      created_at: string;
      transport: APIEventSubTransport;
      cost: number;
    }
  ],
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
  data: [
    {
      id: string;
      status: string;
      type: string;
      version: string;
      condition: APIEventSubCondition;
      created_at: string;
      transport: APIEventSubTransport;
      cost: number;
    }
  ],
  total: number;
  total_cost: number;
  max_total_cost: number;
}

export interface GETUsersResponse {
  data: [
    { 
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
    }
  ]
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

export class TwitchAPIClient {

  public static async validateRequest(): Promise<boolean> {
    return true;
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

  public async getEventSubSubscriptions(): Promise<GETEventSubResponse> {
    return await this.call('/eventsub/subscriptions', 'GET') as GETEventSubResponse;
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