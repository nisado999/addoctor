import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/* What every dialog needs, in one place: Escape and backdrop close only the dialog on top, unsaved work asks first,
   the page behind stops scrolling, and keyboard focus moves in, stays in, and goes back where it was.
   Each dialog keeps its own markup (role="dialog", aria-modal, its label); useDialog renders nothing. */

const FOCUSABLE = 'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),iframe,audio[controls],video[controls],[contenteditable]:not([contenteditable="false"]),[tabindex]:not([tabindex="-1"])';

const stack = [];   // open dialogs, the one on top last

const focusables = (panel) => [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.tabIndex >= 0 && el.getClientRects().length && !el.closest("[inert]"));

function focusPanel(panel) {
  if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
  panel.focus();
}

/* One keyboard listener serves every open dialog, so only the top one reacts. */
function onKey(e) {
  const top = stack[stack.length - 1];
  if (!top || e.defaultPrevented) return;   // handled by something inside the dialog
  if (e.key === "Escape" || e.key === "Esc") {
    if (e.isComposing || e.keyCode === 229) return;   // the visitor is closing an IME suggestion, not the dialog
    e.preventDefault();
    top.request();
    return;
  }
  if (e.key !== "Tab") return;
  const panel = top.panel();
  if (!panel) return;
  const f = focusables(panel);
  const a = document.activeElement;
  if (!f.length) { e.preventDefault(); focusPanel(panel); return; }
  const first = f[0], last = f[f.length - 1];
  if (!panel.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  else if (e.shiftKey && (a === first || a === panel)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
}

/* The page behind stays still while any dialog is open. Counted, so closing one of two stacked dialogs keeps the
   lock, and the last one to close puts back exactly what was there. */
let locks = 0;
let saved = null;
function lockScroll() {
  if (locks++ > 0) return;
  const b = document.body;
  saved = { overflow: b.style.overflow, paddingRight: b.style.paddingRight };
  const bar = window.innerWidth - document.documentElement.clientWidth;   // the scrollbar that is about to go
  b.style.overflow = "hidden";
  if (bar > 0) b.style.paddingRight = `${(parseFloat(getComputedStyle(b).paddingRight) || 0) + bar}px`;
}
function unlockScroll() {
  if (locks === 0 || --locks > 0 || !saved) return;
  document.body.style.overflow = saved.overflow;
  document.body.style.paddingRight = saved.paddingRight;
  saved = null;
}

function useDialog({ onClose, panelRef, dirty = false, dirtyMessage = "Discard your changes?", initialFocusRef, closeOnBackdrop = true }) {
  const me = useRef(null);
  if (!me.current) me.current = { panel: () => panelRef && panelRef.current, request: () => false };
  const requestClose = useCallback(() => {
    const d = me.current;
    if (d.dirty && !window.confirm(d.dirtyMessage)) return false;
    if (d.onClose) d.onClose();
    return true;
  }, []);
  // The latest props, read when a key or click arrives.
  useLayoutEffect(() => { Object.assign(me.current, { onClose, dirty, dirtyMessage, closeOnBackdrop, request: requestClose }); });

  // Where focus was when the dialog was asked for, read before anything inside can take it.
  const [opener] = useState(() => (typeof document !== "undefined" ? document.activeElement : null));

  useEffect(() => {
    const d = me.current;
    stack.push(d);
    if (stack.length === 1) document.addEventListener("keydown", onKey);
    lockScroll();

    // Coming from another dialog that has just closed, the opener is gone; take wherever that dialog put focus back.
    const active = document.activeElement;
    let back = opener && opener.isConnected && opener !== document.body ? opener : active;
    const panel0 = d.panel();
    if (back === document.body || (back && panel0 && panel0.contains(back))) back = null;

    let frame = 0;
    const focusIn = () => {
      const panel = d.panel();
      if (!panel) return false;
      if (panel.contains(document.activeElement)) return true;   // something inside (autoFocus) already has it
      const target = (initialFocusRef && initialFocusRef.current) || focusables(panel)[0];
      if (target) target.focus();
      else focusPanel(panel);
      return true;
    };
    if (!focusIn()) frame = requestAnimationFrame(focusIn);   // the panel can appear a frame late

    return () => {
      cancelAnimationFrame(frame);
      const i = stack.lastIndexOf(d);
      if (i > -1) stack.splice(i, 1);
      if (!stack.length) document.removeEventListener("keydown", onKey);
      unlockScroll();
      // Give focus back only if it was left inside this dialog or dropped on the page, never take it from elsewhere.
      const a = document.activeElement;
      const panel = d.panel();
      if (a && a !== document.body && !(panel && panel.contains(a))) return;
      if (back && back.isConnected) back.focus({ preventScroll: true });
      else if (stack.length) { const p = stack[stack.length - 1].panel(); if (p) focusPanel(p); }
    };
    // Runs once per opening: the latest props are read through me.current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* The backdrop closes the dialog only when the press started and ended on it, so selecting text inside and
     letting go outside does not close it. */
  const downOnOverlay = useRef(false);
  const onPointerDown = useCallback((e) => { downOnOverlay.current = e.target === e.currentTarget; }, []);
  const onClick = useCallback((e) => {
    const hit = downOnOverlay.current && e.target === e.currentTarget;
    downOnOverlay.current = false;
    if (hit && me.current.closeOnBackdrop) requestClose();
  }, [requestClose]);

  return { overlayProps: { onPointerDown, onClick }, requestClose };
}

/* Before something closes every dialog at once (a link to another screen, Back): true when nothing open has
   unsaved work, or the visitor agreed to lose it. */
function confirmDiscard() {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].dirty) return window.confirm(stack[i].dirtyMessage);
  }
  return true;
}

const openDialogCount = () => stack.length;

export { useDialog, confirmDiscard, openDialogCount };
