import Application, { Context, DefaultState } from "koa";
import Router from "koa-router";
import websockify from "koa-websocket";

import { SERVER_PORT } from "./constants.js";
import { AuthorizeRoute, LoginRoute } from "./routes/oauth.js";
import { RContext, Route } from "./routes/route.js";
import { WSRoute } from "./routes/ws.js";
import { Logger } from "./util/logger.js";

// Koa Application with websocket support
const app = websockify<DefaultState, RContext>(new Application);
// 2 routers for HTTP and WS
const router = new Router<DefaultState, RContext>();
const wsRouter = new Router<DefaultState, RContext>();

const logger = new Logger("Server")

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
routes.forEach(r => {
  logger.trace(`Registered HTTP route for class: ${r.constructor.name}`);
  r.register(router);
});

// Add error handling and routing middleware for HTTP
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

// launch the server
app.listen(SERVER_PORT);
logger.info(`Server running on port ${SERVER_PORT}`);