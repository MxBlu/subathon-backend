import fetch from 'node-fetch';

import { refreshToken, StoredToken } from "./auth.js";
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
  secret: string;
}

class AuthorizationError extends Error {
}

export class TwitchAPIClient {
  logger: Logger;

  clientId: string;

  token: StoredToken;

  constructor(token: StoredToken, clientId: string) {
    this.clientId = clientId;
    this.token = token;
  }

  // Call GET /users on the Twitch API
  public async identifyUser(): Promise<GETUsersResponse> {
    return await this.call('/users', 'GET') as GETUsersResponse;
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
    // Do the request
    const response = await fetch(`https://api.twitch.tv/helix${endpoint}`, {
      method: method,
      headers: {
        "Authorization": `Bearer ${this.token.token}`,
        "Client-Id": this.clientId
      },
      body: body
    });
    // If the request returned a bad response, return null;
    if (!response.ok) {
      this.logger.error(`Fetch failed: ${response.status} - ${await response.text()}`);
      return null;
    }
    // Finally return the JSON response
    return await response.json();
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