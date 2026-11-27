#!/usr/bin/env node
/** Prints a fresh VAPID key pair (public + private). Needs: npm i --no-save web-push */
import * as mod from 'web-push';
const webpush = mod.default ?? mod;
console.log(JSON.stringify(webpush.generateVAPIDKeys(), null, 2));
