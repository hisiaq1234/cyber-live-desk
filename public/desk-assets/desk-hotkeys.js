// Deliberate modifier-based shortcuts keep ordinary navigation and text editing untouched.
export function deskHotkeyAction(event, { enabled = false, editable = false, sheetOpen = false, visible = true } = {}) {
  if (!event || !enabled || !visible || event.defaultPrevented || event.isComposing || event.repeat || editable || sheetOpen) return null;
  if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return null;
  if (event.code === "ArrowRight") return "next";
  if (event.code === "ArrowLeft") return "previous";
  if (event.code === "Space") return "hold";
  return null;
}
