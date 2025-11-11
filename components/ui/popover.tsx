"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface PopoverContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement>;
}

const PopoverContext = React.createContext<PopoverContextValue | undefined>(
  undefined
);

export interface PopoverProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Popover({ children, open: controlledOpen, onOpenChange }: PopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement>(null);
  
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = onOpenChange || setUncontrolledOpen;

  return (
    <PopoverContext.Provider value={{ open, setOpen, triggerRef }}>
      <div className="relative">{children}</div>
    </PopoverContext.Provider>
  );
}

export interface PopoverTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
}

export const PopoverTrigger = React.forwardRef<
  HTMLButtonElement,
  PopoverTriggerProps
>(({ children, asChild, ...props }, ref) => {
  const context = React.useContext(PopoverContext);
  if (!context) throw new Error("PopoverTrigger must be used within Popover");

  const handleClick = (e: React.MouseEvent) => {
    context.setOpen(!context.open);
  };

  const combinedRef = (element: HTMLButtonElement | null) => {
    context.triggerRef.current = element;
    if (typeof ref === "function") ref(element);
    else if (ref) ref.current = element;
  };

  if (asChild && React.isValidElement(children)) {
    const existingOnClick = (children as any).props?.onClick;
    const mergedOnClick = (e: React.MouseEvent) => {
      handleClick(e);
      if (existingOnClick) existingOnClick(e);
    };
    return React.cloneElement(children as React.ReactElement<any>, {
      ref: combinedRef,
      onClick: mergedOnClick,
      ...props,
    });
  }

  return (
    <button ref={combinedRef} onClick={handleClick} {...props}>
      {children}
    </button>
  );
});
PopoverTrigger.displayName = "PopoverTrigger";

export interface PopoverContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "center" | "end";
}

export const PopoverContent = React.forwardRef<
  HTMLDivElement,
  PopoverContentProps
>(({ className, align = "start", children, ...props }, ref) => {
  const context = React.useContext(PopoverContext);
  if (!context) throw new Error("PopoverContent must be used within Popover");
  const [position, setPosition] = React.useState({ top: 0, left: 0 });
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Update position when opening
  React.useEffect(() => {
    if (context.open && context.triggerRef.current) {
      const triggerElement = context.triggerRef.current;
      const rect = triggerElement.getBoundingClientRect();
      const popoverWidth = 320; // w-80 = 320px
      
      let newLeft = rect.left;
      
      if (align === "center") {
        newLeft = rect.left + (rect.width / 2) - (popoverWidth / 2);
      } else if (align === "end") {
        newLeft = rect.right - popoverWidth;
      }
      
      // Keep within viewport bounds
      newLeft = Math.max(8, Math.min(newLeft, window.innerWidth - popoverWidth - 8));
      
      const newPosition = {
        top: rect.bottom + 8,
        left: newLeft,
      };
      
      setPosition(newPosition);
    }
  }, [context.open, context.triggerRef, align]);

  const combinedRef = (element: HTMLDivElement | null) => {
    contentRef.current = element;
    if (typeof ref === "function") ref(element);
    else if (ref) ref.current = element;
  };

  if (!context.open || typeof window === "undefined") return null;

  const content = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={() => context.setOpen(false)}
      />
      {/* Content */}
      <div
        ref={combinedRef}
        className={cn(
          "fixed z-50 w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-lg",
          className
        )}
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
        }}
        {...props}
      >
        {children}
      </div>
    </>
  );

  return createPortal(content, document.body);
});
PopoverContent.displayName = "PopoverContent";

