/* CYBER LIVE DESK — shared chat command rules (browser entry point).
   All parsing logic lives in ./_commands.mjs so the controller and the Twitch
   EventSub webhook (api/_twitch-core.mjs) share one implementation.
   This file re-exports everything for browser consumers and tests. */

export {
  BOT_REACTS,
  THOUGHT_WAR_CATEGORY,
  parseDeskCommand,
  commandText,
  parsePollSpec,
  validatePollDraft,
  parseAllowIds,
  chatMayCommand,
  COMMAND_HELP,
} from "./_commands.mjs";
