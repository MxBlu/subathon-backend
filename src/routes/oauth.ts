import { Context } from "koa";
import Router from "koa-router";

import { API_BASE, TWITCH_CLIENT_ID } from "../constants.js";
import { Logger } from "../util/logger.js";
import { Route } from "./route.js";

// Provides login 
export class LoginRoute implements Route {
  logger: Logger;

  constructor() {
    this.logger = new Logger("LoginRoute");
  }

  public register(router: Router, baseRoute: string): void {
    router.get(baseRoute + '/login', this.handle);
  }

  public handle = async (context: Context): Promise<void> => {
    // Redirect to OAuth authorize URL
    context.redirect(this.generateAuthorizationUrl());
  }

  private generateAuthorizationUrl(): string {
    // Generate the params
    const url = new URL("https://id.twitch.tv/oauth2/authorize");
    url.searchParams.set('client_id', TWITCH_CLIENT_ID);
    url.searchParams.set('redirect_uri', `${API_BASE}/authorize`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', "bits:read channel:read:subscriptions");

    return url.toString();
  }
}

export class AuthorizeRoute implements Route {
  logger: Logger;

  constructor() {
    this.logger = new Logger("AuthorizeRoute");
  }

  public register(router: Router, baseRoute: string): void {
    router.get(baseRoute + '/authorize', this.handle);
  }

  public handle = async (context: Context): Promise<void> => {
    const authCode = context.request.query.code as string;
    // If no "code" is present, response is malformed
    if (authCode == null) {
      context.status = 400;
      return;
    }

    // TODO: Figure out the current user's ID
    // TODO: Store users ID along with token in ClientMap
    // TODO: Generate a session to pass along to the frontend

  }

}