import { appState } from "../state";
import { uiElements } from "../dom";
import { postToPlugin } from "../utils";

export function postResize(width: number, height: number): void {
    const w = Math.max(720, Math.min(1600, Math.floor(width)));
    const h = Math.max(420, Math.min(1200, Math.floor(height)));
    postToPlugin({ type: "UI_RESIZE", payload: { width: w, height: h } });
}

export function queueResize(width: number, height: number): void {
    appState.resizeQueued = { width, height };
    if (appState.resizeRaf !== 0) return;
    appState.resizeRaf = window.requestAnimationFrame(() => {
        appState.resizeRaf = 0;
        if (!appState.resizeQueued) return;
        postResize(appState.resizeQueued.width, appState.resizeQueued.height);
        appState.resizeQueued = null;
    });
}

function applyResizeDelta(ev: PointerEvent): void {
    if (
        !appState.resizeTracking ||
        ev.pointerId !== appState.resizeTracking.pointerId
    )
        return;
    const dx = ev.clientX - appState.resizeTracking.startX;
    const dy = ev.clientY - appState.resizeTracking.startY;
    const nextW = appState.resizeTracking.startWidth + dx;
    const nextH = appState.resizeTracking.startHeight + dy;
    queueResize(nextW, nextH);
    ev.preventDefault();
}

export function endResize(ev: PointerEvent): void {
    if (
        !appState.resizeTracking ||
        ev.pointerId !== appState.resizeTracking.pointerId
    )
        return;
    applyResizeDelta(ev);
    window.removeEventListener("pointermove", handleResizeMove, true);
    window.removeEventListener("pointerup", endResize, true);
    window.removeEventListener("pointercancel", cancelResize, true);
    if (uiElements.resizeHandleEl) {
        try {
            uiElements.resizeHandleEl.releasePointerCapture(
                appState.resizeTracking.pointerId
            );
        } catch {
            /* ignore */
        }
    }
    appState.resizeTracking = null;
}

export function cancelResize(ev: PointerEvent): void {
    if (
        !appState.resizeTracking ||
        ev.pointerId !== appState.resizeTracking.pointerId
    )
        return;
    window.removeEventListener("pointermove", handleResizeMove, true);
    window.removeEventListener("pointerup", endResize, true);
    window.removeEventListener("pointercancel", cancelResize, true);
    if (uiElements.resizeHandleEl) {
        try {
            uiElements.resizeHandleEl.releasePointerCapture(
                appState.resizeTracking.pointerId
            );
        } catch {
            /* ignore */
        }
    }
    appState.resizeTracking = null;
}

export function handleResizeMove(ev: PointerEvent): void {
    applyResizeDelta(ev);
}

export function autoFitOnce(): void {
    if (typeof document === "undefined") return;
    const contentW = Math.max(
        document.documentElement.scrollWidth,
        document.body ? document.body.scrollWidth : 0
    );
    const contentH = Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
    );
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const needsW = contentW > vw ? contentW : vw;
    const needsH = contentH > vh ? contentH : vh;
    if (needsW > vw || needsH > vh) postResize(needsW, needsH);
}
