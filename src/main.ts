import Application, { Context } from "koa";
import Router from "koa-router";
import { SERVER_PORT } from "./constants.js";

import { AuthorizeRoute, LoginRoute } from "./routes/oauth.js";
import { Route } from "./routes/route.js";
import { Logger } from "./util/logger.js";

const app = new Application();
const router = new Router();
const logger = new Logger("Server")

// Koa error handling middleware
const errorHandler = async (context: Context, next: () => Promise<void>) => {
  // call our next middleware
  try {
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

// Register all routes
const routes: Route[] = [];
routes.push(new LoginRoute());
routes.push(new AuthorizeRoute());
routes.forEach(r => {
  logger.trace(`Registered route for class: ${r.constructor.name}`);
  r.register(router)
});

// mount the router to our web application
app.use(router.routes());
app.use(router.allowedMethods());

// launch the server
app.listen(SERVER_PORT);
logger.info(`Server running on port ${SERVER_PORT}`);