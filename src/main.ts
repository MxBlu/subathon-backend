import Application, { Context } from "koa";
import Router from "koa-router";
import { API_BASE } from "./constants.js";
import { AuthorizeRoute, LoginRoute } from "./routes/oauth.js";
import { Route } from "./routes/route.js";

const app = new Application();
const router = new Router();

// Koa error handling middleware
const errorHandler = async (context: Context, next: () => Promise<void>) => {
  // call our next middleware
  try {
    await next();
    // catch any error that might have occurred
  } catch (error) {
    context.status = 500;
    context.body = error;
  }
};

app.use(errorHandler);

// Register all routes
const routes: Route[] = [];
routes.push(new LoginRoute());
routes.push(new AuthorizeRoute());
routes.forEach(r => r.register(router, API_BASE));

// mount the router to our web application
app.use(router.routes());
app.use(router.allowedMethods());

// launch the server
app.listen(3000);