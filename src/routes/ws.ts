import Router from "koa-router";
import { ClientMap, HEADER_SESSION_ID, HEADER_SESSION_SECRET } from "../clients.js";
import { Logger } from "../util/logger.js";
import { socketSend } from "../util/socket_utils.js";
import { RContext, Route } from "./route.js";

// Route to handle websocket requests
export class WSRoute implements Route {
  logger: Logger;

  constructor() {
    this.logger = new Logger("LoginRoute");
  }

  public register(router: Router): void {
    router.get('/ws', this.handle);
  }

  public handle = async (context: RContext): Promise<void> => {
    // Get session details from header
    const sessionId = context.header[HEADER_SESSION_ID] as string;
    const sessionSecret = context.header[HEADER_SESSION_SECRET] as string;
    // Find ClientInfo for session
    const clientInfo = ClientMap.getClient(sessionId);
    if (clientInfo == null || clientInfo.sessionSecret != sessionSecret) {
      // If there's no ClientInfo with this session ID 
      //  or the secret doesn't match, drop the connection
      this.logger.warn(
        `Client attempted to connected with unknown or incorrect session: ${sessionId}`);
      socketSend(context.websocket, { 'status': 'UNAUTHORIZED' });
      context.websocket.close(1008);
      return;
    }

    // Register websocket to client
    this.logger.info(`Socket registered for session: ${sessionId}`);
    clientInfo.clientSocket = context.websocket;
    socketSend(context.websocket, { 'status': 'CONNECTED' });

    // When the socket closes, remove the socket from the ClientInfo
    context.websocket.on("close", () => {
      this.logger.info(`Socket disconnected for session: ${sessionId}`);
      clientInfo.clientSocket = null;
    });
  }
}