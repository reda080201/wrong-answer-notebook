import { useEffect, useState, type RefObject } from "react";

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"])';

/** The side panel becomes a modal only when it covers the entire app. */
export function useChatPanelAccessibility(open: boolean, panelRef: RefObject<HTMLElement | null>, launcherRef: RefObject<HTMLButtonElement | null>) {
    const [compact, setCompact] = useState(() => window.matchMedia?.("(max-width: 700px)").matches ?? false);
    useEffect(() => {
        const media = window.matchMedia?.("(max-width: 700px)");
        if (!media) return;
        const change = () => setCompact(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);
    useEffect(() => {
        const panel = panelRef.current;
        if (!open || !compact || !panel) return;
        const launcher = launcherRef.current;
        const hidden = Array.from(document.body.children)
            .filter((node): node is HTMLElement => node instanceof HTMLElement && !node.contains(panel) && !node.matches('[role="dialog"][aria-modal="true"]') && !node.querySelector('[role="dialog"][aria-modal="true"]'))
            .map(element => ({ element, inert: element.inert, ariaHidden: element.getAttribute("aria-hidden") }));
        const launcherInert = launcher?.inert;
        hidden.forEach(({ element }) => { element.inert = true; element.setAttribute("aria-hidden", "true"); });
        if (launcher) launcher.inert = true;
        const foregroundDialog = () => Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
            .some(dialog => dialog !== panel && !dialog.closest("[inert]") && dialog.getClientRects().length > 0);
        const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
            .filter(element => !element.closest("[inert]") && element.getClientRects().length > 0);
        const containFocus = (event: FocusEvent) => {
            if (!foregroundDialog() && event.target instanceof Node && !panel.contains(event.target)) (focusable()[0] ?? panel).focus();
        };
        const handleTab = (event: KeyboardEvent) => {
            if (event.key !== "Tab" || foregroundDialog()) return;
            const items = focusable();
            const first = items[0] ?? panel;
            const last = items[items.length - 1] ?? panel;
            if (!panel.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first || document.activeElement === panel : document.activeElement === last)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            }
        };
        document.addEventListener("focusin", containFocus, true);
        document.addEventListener("keydown", handleTab, true);
        if (!panel.contains(document.activeElement) && !foregroundDialog()) (focusable()[0] ?? panel).focus();
        return () => {
            document.removeEventListener("focusin", containFocus, true);
            document.removeEventListener("keydown", handleTab, true);
            hidden.forEach(({ element, inert, ariaHidden }) => {
                element.inert = inert;
                if (ariaHidden === null) element.removeAttribute("aria-hidden");
                else element.setAttribute("aria-hidden", ariaHidden);
            });
            if (launcher) launcher.inert = launcherInert ?? false;
            if (!panel.isConnected) launcher?.focus();
        };
    }, [open, compact, panelRef, launcherRef]);
    return compact;
}
