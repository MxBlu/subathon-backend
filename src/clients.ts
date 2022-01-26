import * as crypto from "crypto";
import * as WebSocket from 'ws';

import { StoredToken } from "./auth.js";
import { CLIENT_MAP_GC_INTERVAL, CLIENT_TIMEOUT, WEBHOOK_URI } from "./constants.js";
import { TwitchAPIClient } from "./twitch.js";
import { Logger } from "./util/logger.js";

export const HEADER_SESSION_ID = "x-session-id";
export const HEADER_SESSION_SECRET = "x-session-secret";

export class ClientInfo {
  // Session ID
  sessionId: string;
  // Secret for verifying the session
  sessionSecret: string;
  // Date session was initialised
  initDate: Date;
  // Client token for API calls
  clientToken: StoredToken;
  // Secret to verify webhook messages
  webhookSecret: string;
  // Webhooks IDs for registered webhooks
  webhooks: string[] = [];
  // Websocket connection to the client
  clientSocket: WebSocket;
}

function dateAge(date: Date): number {
  const now = new Date();
  return now.getTime() - date.getTime();
}

class ClientMapImpl {
  logger: Logger;
  // User IDs mapped to ClientInfos
  clients: Map<string, ClientInfo>;

  constructor() {
    this.logger = new Logger("ClientMap");
    this.clients = new Map();
    // Start the cleanup task
    setInterval(this.clientGarbageCollectionTask, CLIENT_MAP_GC_INTERVAL);
  }

  // Return a ClientInfo for a given session
  public getClient(sessionId: string): ClientInfo {
    return this.clients.get(sessionId);
  }

  // Generate a session and return to the client
  public generateSession(clientToken: StoredToken): ClientInfo {
    const clientInfo = new ClientInfo();
    clientInfo.clientToken = clientToken;
    clientInfo.initDate = new Date();
    // Generate session ID and secrets
    clientInfo.sessionId = crypto.randomUUID();
    clientInfo.sessionSecret = crypto.randomBytes(16).toString("hex");
    clientInfo.webhookSecret = crypto.randomBytes(8).toString("hex");
    // Add to the client map and return ClientInfo
    this.clients.set(clientInfo.sessionId, clientInfo);
    return clientInfo;
  }

  // Setup a newly connected client
  // Assumes the session is present
  public async setupClient(sessionId: string, socket: WebSocket): Promise<void> {
    const clientInfo = this.getClient(sessionId);
    clientInfo.clientSocket = socket;

    // Create a client with the user's credentials
    const userClient = new TwitchAPIClient(clientInfo.clientToken);
    // Get info about the current user
    const userResponse = await userClient.identifyUser();
    const userId = userResponse.data[0].id;
    this.logger.debug(`Identified user for session: ${sessionId} as ${userId}`);
    // Create a client with the app's credentials
    const appClient = new TwitchAPIClient();
    // Setup webhooks to listen to
    const followWebhookResponse = await appClient.createEventSubSubscription(
        "channel.follow", userId, WEBHOOK_URI, clientInfo.webhookSecret);
    this.logger.debug(
        `Created webhook for session: ${sessionId}, ${followWebhookResponse.data[0].id}`);
    this.logger.trace(`Webhook cost: ${followWebhookResponse.data[0].cost} / ${followWebhookResponse.max_total_cost}`);
    clientInfo.webhooks.push(followWebhookResponse.data[0].id);
    // TODO: setup webhooks
  }

  // Clean up a retired client
  // Removes webhooks and other associated
  public async cleanupClient(sessionId: string): Promise<void> {
    const clientInfo = this.getClient(sessionId);
    if (clientInfo != null) {
      // TODO: remove active webhooks
      this.logger.warn(`Cleaning up client: ${clientInfo.sessionId}`);

      // Clean up active webhooks
      const client = new TwitchAPIClient();
      for (const webhookId of clientInfo.webhooks) {
        try {
          await client.deleteEventSubSubscription(webhookId);
          this.logger.debug(
              `Deleted webhook for session: ${sessionId}, ${webhookId}`);
        } catch (e) {
          this.logger.error(`Failed to delete webhook: ${e}`);
          this.logger.error((e as Error).stack);
        }
      }

      // Remove from the client map
      this.clients.delete(sessionId);
    }
  }

  // Remove client sessions that aren't being used
  private clientGarbageCollectionTask = () => {
    // Iterate over all the clients
    for (const clientInfo of this.clients.values()) {
      // If the socket is not present, and older than CLIENT_TIMEOUT
      if (clientInfo.clientSocket == null && 
          dateAge(clientInfo.initDate) > CLIENT_TIMEOUT) {
        // Clean up the client
        this.logger.warn(`Cleaning up stale client: ${clientInfo.sessionId}`);
        this.cleanupClient(clientInfo.sessionId);
      }
    }
  }
}

export const ClientMap = new ClientMapImpl();