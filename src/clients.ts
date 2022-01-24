import * as crypto from "crypto";

import { StoredToken } from "./auth.js";
import { CLIENT_MAP_GC_INTERVAL, CLIENT_TIMEOUT } from "./constants.js";
import { Logger } from "./util/logger.js";

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
  clientSocket: never;
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

  // Clean up a retired client
  // Removes webhooks and other associated
  public cleanupClient(sessionId: string): void {
    const clientInfo = this.getClient(sessionId);
    if (clientInfo != null) {
      // TODO: remove active webhooks
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
        this.cleanupClient(clientInfo.sessionId);
      }
    }
  }
}

export const ClientMap = new ClientMapImpl();