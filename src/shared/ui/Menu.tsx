import { Children, Fragment, cloneElement, isValidElement, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

interface MenuProps {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function Menu({ label, children, className = "" }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const closeMenu = (restoreFocus = false) => {
    if (restoreFocus) {
      const focusTarget = previousFocusRef.current && previousFocusRef.current !== document.body
        ? previousFocusRef.current
        : triggerRef.current;
      focusTarget?.focus();
    }
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) closeMenu();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const firstItem = menuRef.current?.querySelector<HTMLElement>("[role=menuitem]");
    firstItem?.focus();
  }, [open]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (!items.length || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (currentIndex + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  const addMenuItemRole = (child: ReactNode): ReactNode => {
    if (!isValidElement(child)) return child;
    if (child.type === Fragment) {
      return Children.map(child.props.children, addMenuItemRole);
    }
    return cloneElement(child, { role: "menuitem" });
  };
  const menuChildren = Children.map(children, addMenuItemRole);

  return (
    <div ref={ref} className={className}>
      <button
        ref={triggerRef}
        type="button"
        className="btn-icon"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            closeMenu(true);
          } else {
            previousFocusRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
              ? document.activeElement
              : null;
            setOpen(true);
          }
        }}
      >{label}</button>
      {open && <div ref={menuRef} className="detail-more-menu-popover" role="menu" onKeyDown={handleMenuKeyDown}>{menuChildren}</div>}
    </div>
  );
}
