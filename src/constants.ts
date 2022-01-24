import * as dotenv from 'dotenv';
dotenv.config();

import { LogLevel } from "./util/log_levels.js";

// Default logging level
export const DEFAULT_LOG_LEVEL: LogLevel = LogLevel[process.env.LOG_LEVEL] || LogLevel.INFO;
// Padding length with name
export const LOGGER_NAME_PAD_LENGTH = 20;

// Port to run REST server on
export const SERVER_PORT = parseInt(process.env.SERVER_PORT) || 3000;

// Base URL for the API - used for OAuth and webhook generation
export const API_BASE = process.env.API_BASE;
// Base URL for the frontend - used following OAuth flow
export const FRONTEND_BASE = process.env.FRONTEND_BASE;
// URL to redirect from OAuth
export const OAUTH_REDIRECT_URI = `${API_BASE}/authorize`;
// Twitch API client ID
export const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
// Twitch API client secret
export const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

// Timeout interval before a client is garbage collected from the ClientMap (milliseconds)
export const CLIENT_TIMEOUT = 5 * 60 * 1000;
// Interval between garbage collection runs in ClientMap (milliseconds)
export const CLIENT_MAP_GC_INTERVAL = 5 * 60 * 1000;