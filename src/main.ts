import Application, { Context, DefaultState } from "koa";
import bodyParser from "koa-bodyparser";
import Router from "koa-router";
import websockify from "koa-websocket";

import { SERVER_PORT, SERVER_REVERSE_PROXY } from "./constants.js";
import { AuthorizeRoute, LoginRoute } from "./routes/oauth.js";
import { RContext, Route } from "./routes/route.js";
import { WebhookRoute } from "./routes/webhook.js";
import { WSRoute } from "./routes/ws.js";
import { cleanupOldWebhooks, initialiseAppToken } from "./twitch.js";
import { Logger } from "./util/logger.js";

const logger = new Logger("Server");

// Koa Application with websocket support
const app = websockify<DefaultState, RContext>(new Application({ proxy: SERVER_REVERSE_PROXY }));
// 2 routers for HTTP and WS
const router = new Router<DefaultState, RContext>();
const wsRouter = new Router<DefaultState, RContext>();

// Koa error handling middleware
const errorHandler = async (context: Context, next: () => Promise<void>) => {
  // call our next middleware
  try {
    const requestType = context.websocket != null ? "WS" : "HTTP";
    logger.info(`Request: ${requestType} - ${context.path} - ${context.ip}`);
    await next();
    // catch any error that might have occurred
  } catch (error) {
    logger.error(`Failed to process request to ${context.request.path}: ${error}`);
    if (error instanceof Error) {
      logger.error(error.stack);
    }
    context.status = 500;
    context.body = "An error occured";
  }
};

// Unknown route handler for WS
const wsUnknownRoute = (ctx: RContext): void => {
  logger.warn(`WS Request to unknown endpoint received`);
  ctx.websocket.close(1003);
}

// Register all HTTP routes into HTTP router
const routes: Route[] = [];
routes.push(new LoginRoute());
routes.push(new AuthorizeRoute());
routes.push(new WebhookRoute())
routes.forEach(r => {
  logger.trace(`Registered HTTP route for class: ${r.constructor.name}`);
  r.register(router);
});

// Add body parsing, error handling and routing middleware for HTTP
app.use(bodyParser());
app.use(errorHandler);
app.use(router.routes());
app.use(router.allowedMethods());

// Register all WS routes into WS router
const wsRoutes: Route[] = [];
wsRoutes.push(new WSRoute());
wsRoutes.forEach(r => {
  logger.trace(`Registered WS route for class: ${r.constructor.name}`);
  r.register(wsRouter);
});

const wsRoutesMiddleware = wsRouter.routes() as unknown;

// Add error handling and routing middleware for WS
app.ws.use(errorHandler);
app.ws.use(wsRoutesMiddleware as websockify.Middleware<Application.DefaultState, RContext>);
app.ws.use(wsUnknownRoute);

async function initTwitchAppClient() {
  // Load the Twitch app credentials
  await initialiseAppToken();
  // Remove old webhooks from previous runs
  await cleanupOldWebhooks();
}

// Run async init routines
initTwitchAppClient();

// launch the server
app.listen(SERVER_PORT);
logger.info(`Server running on port ${SERVER_PORT}`);