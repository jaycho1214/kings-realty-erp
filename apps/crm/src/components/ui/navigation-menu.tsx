"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";

/* ---- Context ---- */
interface NavMenuContextValue {
  activeItem: string | null;
  setActiveItem: (id: string | null) => void;
}
const NavMenuContext = React.createContext<NavMenuContextValue>({
  activeItem: null,
  setActiveItem: () => {},
});

function NavigationMenu({
  className,
  children,
  ...props
}: React.ComponentProps<"nav">) {
  const [activeItem, setActiveItem] = React.useState<string | null>(null);

  return (
    <NavMenuContext.Provider value={{ activeItem, setActiveItem }}>
      <nav
        data-slot="navigation-menu"
        className={cn(
          "group/navigation-menu relative flex max-w-max flex-1 items-center justify-center",
          className,
        )}
        {...props}
      >
        {children}
      </nav>
    </NavMenuContext.Provider>
  );
}

function NavigationMenuList({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="navigation-menu-list"
      className={cn(
        "group flex flex-1 list-none items-center justify-center gap-0",
        className,
      )}
      {...props}
    />
  );
}

function NavigationMenuItem({
  className,
  children,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="navigation-menu-item"
      className={cn("relative", className)}
      {...props}
    >
      {children}
    </li>
  );
}

const navigationMenuTriggerStyle = () =>
  "group/navigation-menu-trigger inline-flex h-9 w-max items-center justify-center rounded-lg bg-background px-2.5 py-1.5 text-sm font-medium transition-all outline-none hover:bg-default focus:bg-default focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-popup-open:bg-default/50 data-popup-open:hover:bg-default data-open:bg-default/50 data-open:hover:bg-default data-open:focus:bg-default";

function NavigationMenuTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      data-slot="navigation-menu-trigger"
      className={cn(navigationMenuTriggerStyle(), "group", className)}
      {...props}
    >
      {children}{" "}
      <ChevronDownIcon
        className="relative top-px ml-1 size-3 transition duration-300"
        aria-hidden="true"
      />
    </button>
  );
}

function NavigationMenuContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="navigation-menu-content"
      className={cn("h-full w-auto p-1", className)}
      {...props}
    />
  );
}

function NavigationMenuLink({
  className,
  ...props
}: React.ComponentProps<"a">) {
  return (
    <a
      data-slot="navigation-menu-link"
      className={cn(
        "flex items-center gap-2 rounded-lg p-2 text-sm transition-all outline-none hover:bg-default focus:bg-default focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 data-active:bg-default/50 data-active:hover:bg-default data-active:focus:bg-default [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function NavigationMenuIndicator({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="navigation-menu-indicator"
      className={cn(
        "top-full z-1 flex h-1.5 items-end justify-center overflow-hidden",
        className,
      )}
      {...props}
    >
      <div className="relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-border shadow-md" />
    </div>
  );
}

function NavigationMenuPositioner() {
  return null;
}

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
  NavigationMenuPositioner,
};
