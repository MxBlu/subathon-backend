import { Context } from "koa";
import Router from "koa-router";
import { retrieveToken } from "../auth.js";
import { ClientInfo, ClientMap } from "../clients.js";

import { FRONTEND_BASE, OAUTH_REDIRECT_URI, TWITCH_CLIENT_ID } from "../constants.js";
import { Logger } from "../util/logger.js";
import { Route } from "./route.js";

// Provides login 
export class LoginRoute implements Route {
  logger: Logger;

  constructor() {
    this.logger = new Logger("LoginRoute");
  }

  public register(router: Router): void {
    router.get('/login', this.handle);
  }

  public handle = async (context: Context): Promise<void> => {
    // Redirect to OAuth authorize URL
    context.redirect(this.generateAuthorizationUrl());
  }

  private generateAuthorizationUrl(): string {
    // Generate the params
    const url = new URL("https://id.twitch.tv/oauth2/authorize");
    url.searchParams.set('client_id', TWITCH_CLIENT_ID);
    url.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', "bits:read channel:read:subscriptions");

    return url.toString();
  }
}

// Handles OAuth callback - initialises session
export class AuthorizeRoute implements Route {
  logger: Logger;

  constructor() {
    this.logger = new Logger("AuthorizeRoute");
  }

  public register(router: Router): void {
    router.get('/authorize', this.handle);
  }

  public handle = async (context: Context): Promise<void> => {
    const authCode = context.request.query.code as string;
    // If no "code" is present, response is malformed
    if (authCode == null) {
      context.status = 400;
      return;
    }

    // Cash in auth code to get an access token
    const token = await retrieveToken(authCode);
    // Generate a session for the token
    const clientInfo = ClientMap.generateSession(token);

    this.logger.debug(`Generated session for new client: ${clientInfo.sessionId}`);

    // Redirect back to the frontend, with session details
    context.redirect(this.generateFrontendUrl(clientInfo));
  }

  private generateFrontendUrl(clientInfo: ClientInfo): string {
    // Generate the params
    const url = new URL(FRONTEND_BASE);
    url.searchParams.set('sid', clientInfo.sessionId);
    url.searchParams.set('sau', clientInfo.sessionSecret);

    return url.toString();
  }
}