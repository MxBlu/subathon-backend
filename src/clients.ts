import * as crypto from "crypto";

import { StoredToken } from "./auth.js";
import { Logger } from "./util/logger.js";

export class ClientInfo {
  // Session ID
  sessionId: string;
  // Secret for verifying the session
  sessionSecret: string;
  // Client token for API calls
  clientToken: StoredToken;
  // Secret to verify webhook messages
  webhookSecret: string;
  // Webhooks IDs for registered webhooks
  webhooks: string[] = [];
  // Websocket connection to the client
  clientSocket: never;
}

class ClientMapImpl {
  logger: Logger;
  // User IDs mapped to ClientInfos
  clients: Map<string, ClientInfo>;

  constructor() {
    this.logger = new Logger("ClientMap");
    this.clients = new Map();
  }

  // Return a ClientInfo for a given session
  public getClient(sessionId: string): ClientInfo {
    return this.clients.get(sessionId);
  }

  // Generate a session and return to the client
  public generateSession(clientToken: StoredToken): ClientInfo {
    const clientInfo = new ClientInfo();
    clientInfo.clientToken = clientToken;
    // Generate session ID and secrets
    clientInfo.sessionId = crypto.randomUUID();
    clientInfo.sessionSecret = crypto.randomBytes(16).toString("hex");
    clientInfo.webhookSecret = crypto.randomBytes(8).toString("hex");

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
}

export const ClientMap = new ClientMapImpl();