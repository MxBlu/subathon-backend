import Router from "koa-router";

import { Logger } from "../util/logger.js";
import { RContext, Route } from "./route.js";

// Handle webhook calls from Twitch
export class WebhookRoute implements Route {
  logger: Logger;

  constructor() {
    this.logger = new Logger("WebhookRoute");
  }

  public register(router: Router): void {
    router.post('/webhook', this.handle);
  }

  public handle = async (context: RContext): Promise<void> => {
    this.logger.info(`Webhook received`);
    console.log(context.headers);
    console.log(context.request.body);
    // To prevent issues
    context.status = 204;
  }

}