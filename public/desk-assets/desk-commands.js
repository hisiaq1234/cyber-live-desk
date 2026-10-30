/* CYBER LIVE DESK — shared chat command rules (browser entry point).
   All parsing logic lives in ./_commands.mjs so the controller and the Twitch
   EventSub webhook (netlify/functions/_twitch-core.mjs) share one implementation.
   This file re-exports everything for browser consumers and tests. */

export {
  parseDeskCommand,
  parsePollSpec,
  validatePollDraft,
  parseAllowIds,
  chatMayCommand,
  COMMAND_HELP,
} from "./_commands.mjs";
