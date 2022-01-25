import fetch from 'node-fetch';

import { refreshToken, StoredToken } from "./auth.js";
import { Logger } from "./util/logger.js";

/*
  Twitch API client
*/

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
    return await this.get('/users') as GETUsersResponse;
  }

  // Make a GET request to the Twitch API
  private async get(endpoint: string): Promise<unknown> {
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
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.token.token}`,
        "Client-Id": this.clientId
      }
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