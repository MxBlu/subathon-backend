import { Context, DefaultState, ParameterizedContext } from "koa";
import Router from "koa-router";

export type RouteHandlerFn = (context: Context, next: RouteHandlerFn) => Promise<void>;

export type RContext = ParameterizedContext<
  DefaultState,
  Context & Router.IRouterParamContext<DefaultState, Context>
>;

// Interface to represent a accesible route
export interface Route {
  // Register route into provided Router
  register(router: Router): void;
  // Handle the route
  handle: RouteHandlerFn;
}