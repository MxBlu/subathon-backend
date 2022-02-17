import Router from "koa-router";
import { ClientInfo, ClientMap } from "../clients.js";
import { CLIENT_TIMEOUT } from "../constants.js";
import { Logger } from "../util/logger.js";
import { socketSend } from "../util/socket_utils.js";
import { RContext, Route } from "./route.js";

// Interface for authentication payload on WS startup
interface WsAuthenticationMessage {
  sessionId: string;
  sessionSecret: string;
}

// Route to handle websocket requests
export class WSRoute implements Route {
  logger: Logger;

  constructor() {
    this.logger = new Logger("WSRoute");
  }

  public register(router: Router): void {
    router.get('/ws', this.handle);
  }

  public handle = async (context: RContext): Promise<void> => {
    // Track clientInfo across the arrow functions in this call
    let clientInfo: ClientInfo = null;

    // Close the connection after CLIENT_TIMEOUT ms if not authenticated
    const connectionTimeout = setTimeout(() => {
      this.logger.warn(`Unauthenticated session timed out: ${context.ip}`);
      socketSend(context.websocket, { 'status': 'TIMED_OUT' });
      context.websocket.close(1008);
    }, CLIENT_TIMEOUT);

    // Handle receiving a message, which must be a WsAuthenticationMessage
    context.websocket.on('message', async (message: string): Promise<void> => {
      // Since we've received a message, prevent the connection from timing out
      clearTimeout(connectionTimeout);
      // Parse the authentication request into an object
      let authMessage: WsAuthenticationMessage = null;
      try {
        authMessage = JSON.parse(message);
      } catch (e) {
        // Message isn't a JSON... leave authMessage as null
      }

      // If there's no sessionId set, the request is invalid
      if (authMessage?.sessionId == null) {
        this.logger.warn(
          `Client sent a malformed authentication request: ${context.ip}`);
        socketSend(context.websocket, { 'status': 'BAD_REQUEST' });
        context.websocket.close(1008);
        return;
      }

      // Find ClientInfo for session
      const requestedClientInfo = ClientMap.getClient(authMessage.sessionId);
      if (requestedClientInfo == null || requestedClientInfo.sessionSecret != authMessage.sessionSecret) {
        // If there's no ClientInfo with this session ID 
        //  or the secret doesn't match, drop the connection
        this.logger.warn(
          `Client attempted to connected with unknown or incorrect session: ${authMessage.sessionId}, ${context.ip}`);
        socketSend(context.websocket, { 'status': 'UNAUTHORIZED' });
        context.websocket.close(1008);
        return;
      }

      // Track the clientInfo across the closures handling the websocket
       clientInfo = requestedClientInfo;

      // Close existing client sockets
      if (clientInfo.clientSocket != null) {
        this.logger.warn(
          `Closing existing socket for session and replacing: ${authMessage.sessionId}, ${context.ip}`);
        socketSend(clientInfo.clientSocket, { 'status': 'SWITCHING_SOCKET' });
        clientInfo.clientSocket.close();
      }

      // Finally, set up the client session on the websocket
      try {
        // Register websocket to client
        await ClientMap.setupClient(clientInfo.sessionId, context.websocket);
        this.logger.info(`Socket registered for session: ${clientInfo.sessionId}`);
        // Let the socket know we're set up
        socketSend(context.websocket, { 'status': 'CONNECTED' });
      } catch (e) {
        this.logger.error(`Unable to setup client: ${e}`);
        this.logger.error((e as Error).stack);
        // Alert the socket that we failed and close the connection
        socketSend(context.websocket, { 'status': 'ERROR' });
        context.websocket.close(1008);
      }
    });

    // Setup socket cleanup handler
    context.websocket.on("close", (a, b) => {
      if (clientInfo != null) {
        this.logger.info(`Socket disconnected for session: ${clientInfo.sessionId}`);
        // Update the last activity date
        clientInfo.lastActivity = new Date();
        // Just remove the client socket from client info
        //  but only if the current socket is actually the socket in this closure
        if (clientInfo.clientSocket == context.websocket) {
          clientInfo.clientSocket = null;
        }
      }
    });
  }
}