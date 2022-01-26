import Router from "koa-router";
import { ClientMap } from "../clients.js";
import { TwitchAPIClient, WebhookEventRequest } from "../twitch.js";

import { Logger } from "../util/logger.js";
import { socketSend } from "../util/socket_utils.js";
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
    const request: WebhookEventRequest = context.request.body;

    // Verify this webhook event is one we know of
    const webhookId = request?.subscription?.id;
    const clientInfo = ClientMap.getClientInfoForWebhook(webhookId);
    if (clientInfo == null) {
      // If we don't have a clientInfo for this request, deny it
      this.logger.warn(`Webhook event received for an unknown webhook: ${webhookId}`);
      context.status = 401;
      return;
    }

    // Verify that this event indeed came from Twitch
    if (!TwitchAPIClient.validateRequest(
        context.request.rawBody, context.headers, clientInfo.webhookSecret)) {
      // If the request fails validation, deny it
      this.logger.warn(`Webhook event failed HMAC validation: ${webhookId}`);
      context.status = 401;
      return;
    }

    // If the request is a validation request, return the challenge
    if (request.challenge != null) {
      this.logger.debug(`Challenge received for webhook: ${webhookId}`);
      context.body = request.challenge;
      context.status = 200;
      return;
    }

    // If the webhook subscription status is anything but 'enabled'
    //  assume that there's something wrong, and we need to delete
    //  the subscription
    if (request.subscription.status != 'enabled') {
      this.logger.warn(`Webhook subscription no longer valid: ${webhookId}, ${request.subscription.status}`);
      // Delete the subscription
      const appClient = new TwitchAPIClient();
      appClient.deleteEventSubSubscription(webhookId);
      // Get angry for no reason
      context.status = 401;
      return;
    }

    // Send the event to the associated websocket
    if (clientInfo.clientSocket != null) {
      socketSend(clientInfo.clientSocket, request);
      this.logger.info(`Webhook event forwarded to socket: ${request.subscription.type}, ${clientInfo.sessionId}`);
    }

    // All processed well, return a 204
    context.status = 204;
  }

}