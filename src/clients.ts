import * as crypto from "crypto";
import * as WebSocket from 'ws';

import { StoredToken } from "./auth.js";
import { CLIENT_MAP_GC_INTERVAL, CLIENT_TIMEOUT, WEBHOOK_URI } from "./constants.js";
import { cleanupOldWebhooks, TwitchAPIClient } from "./twitch.js";
import { Logger } from "./util/logger.js";

// Webhook types to register for a new client
const WEBHOOK_TYPES = [ "channel.subscribe", "channel.subscription.gift", "channel.cheer" ];

export class ClientInfo {
  // Session ID
  sessionId: string;
  // Secret for verifying the session
  sessionSecret: string;
  // Date the socket last had a significant event
  lastActivity: Date;
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
  // Lookup from webhook ID to session ID
  webhookSessionLookup: Map<string, string>;

  constructor() {
    this.logger = new Logger("ClientMap");
    this.clients = new Map();
    this.webhookSessionLookup = new Map();
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
    clientInfo.lastActivity = new Date();
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

    // If there's no webhooks present on the client, create them
    if (clientInfo.webhooks.length == 0) {
      // Create a client with the user's credentials
      const userClient = new TwitchAPIClient(clientInfo.clientToken);
      // Get info about the current user
      const userResponse = await userClient.identifyUser();
      const userId = userResponse.data[0].id;
      this.logger.debug(`Identified user for session: ${sessionId} as ${userId}`);
      // Clean up old webhooks for this user
      cleanupOldWebhooks(userId);
      // Create a client with the app's credentials
      const appClient = new TwitchAPIClient();
      // Setup webhooks to listen to
      for (const type of WEBHOOK_TYPES) {
        const webhookResponse = await appClient.createEventSubSubscription(
            type, userId, WEBHOOK_URI, clientInfo.webhookSecret);
        const webhookId = webhookResponse.data[0].id;
        this.logger.debug(
            `Created webhook of type '${type}' for session: ${sessionId}, ${webhookId}`);
        // Add webhooks to ClientInfo and lookup
        clientInfo.webhooks.push(webhookId);
        this.webhookSessionLookup.set(webhookId, sessionId);
      }
    }
  }

  // Clean up a retired client
  // Removes webhooks and other associated
  public async cleanupClient(sessionId: string): Promise<void> {
    const clientInfo = this.getClient(sessionId);
    if (clientInfo != null) {
      this.logger.warn(`Cleaning up client: ${clientInfo.sessionId}`);

      // Clean up active webhooks
      const client = new TwitchAPIClient();
      for (const webhookId of clientInfo.webhooks) {
        try {
          await client.deleteEventSubSubscription(webhookId);
          this.logger.debug(
              `Deleted webhook for session: ${sessionId}, ${webhookId}`);
          this.webhookSessionLookup.delete(webhookId);
        } catch (e) {
          this.logger.error(`Failed to delete webhook: ${e}`);
          this.logger.error((e as Error).stack);
        }
      }

      // Remove from the client map
      this.clients.delete(sessionId);
    }
  }

  // Get the ClientInfo for a given webhook ID
  public getClientInfoForWebhook(webhookId: string): ClientInfo {
    // If the webhook ID is null, return null
    if (webhookId == null) {
      return null;
    }
    // Attempt to find a session ID from the lookup, return null if not present
    const sessionId = this.webhookSessionLookup.get(webhookId);
    if (sessionId == null) {
      return null;
    }
    // Return the ClientInfo for the session ID
    return this.clients.get(sessionId);
  }

  // Remove client sessions that aren't being used
  private clientGarbageCollectionTask = () => {
    // Iterate over all the clients
    for (const clientInfo of this.clients.values()) {
      // If the socket is not present, and older than CLIENT_TIMEOUT
      if (clientInfo.clientSocket == null && 
          dateAge(clientInfo.lastActivity) > CLIENT_TIMEOUT) {
        // Clean up the client
        this.logger.warn(`Cleaning up stale client: ${clientInfo.sessionId}`);
        this.cleanupClient(clientInfo.sessionId);
      }
    }
  }
}

export const ClientMap = new ClientMapImpl();