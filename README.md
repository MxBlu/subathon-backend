# Twitch Subathon Timer backend

A sample backend for a subathon timer written for a friend who ended up going with a different approach

## Methodology

This solution takes the approach of being a proxy between Twitch and the web client, relaying webhook event messages to a websocket instead. This is done since the PubSub websocket API does not support 'follows'.

## Setup

1. Copy `.env.template` to `.env` and fill out properties.
2. Add `${API_BASE}/authorize` to Twitch's authorized URLs for OAuth callbacks
3. Run `yarn install` to pull dependencies.
4. Run `yarn build` to compile the TS.
5. Run `node built/main.js` to run the server.

Add or remove webhooks to receive in `src/client.ts` in the `WEBHOOK_TYPES` global array.

## Usage

Rough usage goes something like this:
1. Send user to `${API_BASE}/login`
2. User is redirected to Twitch OAuth login page
3. User returns to `${API_BASE}/authorize`, which creates a session and redirects the user to `${FRONTEND_BASE}/?sid=<sessionId>&sau=<sessionSecret>`
5. Client, seeing the `sid` and `sau` parameter, creates a websocket connection to `${API_BASE}/ws`
6. Client sends a payload of `{ sessionId: <sessionId>, sessionSecret: <sessionSecret> }`
7. Upon receiving a response of `{ status: "CONNECTED" }`, the client is good to listen on the socket for forwarded webhook events

## Notes

See `src/routes/ws.ts` for more info on other websocket status messages and why they may be thrown.

Sessions/sockets will be timed out if:
* There is no authentication attempt within 5 minutes
* The session has not had a connected socket within the last 5 mintues

## Disclaimer

This solution ended up not being used, due to the extra burden of a server being needed, and complications to do with handling re-follows.

Use and debug at your own risk.