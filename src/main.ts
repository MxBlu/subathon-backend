import Application, { Context } from "koa";
import Router from "koa-router";

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

// TODO: Load routes, maybe just reorg this whole file

// mount the router to our web application
app.use(router.routes());
app.use(router.allowedMethods());

// launch the server
app.listen(3000);