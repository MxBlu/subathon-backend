import Application, { Context, DefaultState } from "koa";
import Router from "koa-router";
import websockify from "koa-websocket";

import { SERVER_PORT } from "./constants.js";
import { AuthorizeRoute, LoginRoute } from "./routes/oauth.js";
import { RContext, Route } from "./routes/route.js";
import { Logger } from "./util/logger.js";

const app = websockify<DefaultState, RContext>(new Application);
const router = new Router<DefaultState, RContext>();

const logger = new Logger("Server")

// Koa error handling middleware
const errorHandler = async (context: Context, next: () => Promise<void>) => {
  // call our next middleware
  try {
    logger.trace(`hit in context with ws as: ${context.websocket}`)
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

app.use(errorHandler);
app.ws.use(errorHandler);

// Register all routes
const routes: Route[] = [];
routes.push(new LoginRoute());
routes.push(new AuthorizeRoute());
routes.forEach(r => {
  logger.trace(`Registered HTTP route for class: ${r.constructor.name}`);
  r.register(router);
});

app.use(router.routes());
app.use(router.allowedMethods());

const wsRouter = new Router<DefaultState, RContext>();
wsRouter.get('/ws', (ctx: RContext): void => {
  ctx.websocket.send('Hello World');
  ctx.websocket.on('message', (message) => {
    console.log(message);
  });
});

const wsUnknownRoute = (ctx: RContext): void => {
  logger.warn(`WS Request to unknown endpoint received`);
  ctx.websocket.close(1003);
}

const wsRoutes = wsRouter.routes();

//fku
app.ws.use(wsRoutes as unknown as websockify.Middleware<Application.DefaultState, RContext>);
app.ws.use(wsUnknownRoute);

// launch the server
app.listen(SERVER_PORT);
logger.info(`Server running on port ${SERVER_PORT}`);