export type AppRoute =
  | { name: "workspace" }
  | { name: "thread"; threadId: string }
  | { name: "settings" };

const decodePathSegment = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const parseAppRoute = (pathname: string): AppRoute => {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/settings") {
    return { name: "settings" };
  }
  if (normalized.startsWith("/thread/")) {
    const threadId = decodePathSegment(normalized.slice("/thread/".length));
    if (threadId) {
      return { name: "thread", threadId };
    }
  }
  return { name: "workspace" };
};

export const appRoutePath = (route: AppRoute): string => {
  switch (route.name) {
    case "settings":
      return "/settings";
    case "thread":
      return `/thread/${encodeURIComponent(route.threadId)}`;
    case "workspace":
    default:
      return "/";
  }
};

export const navigateToRoute = (route: AppRoute, options?: { replace?: boolean }): void => {
  const nextPath = appRoutePath(route);
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentPath === nextPath) {
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }
  if (options?.replace) {
    window.history.replaceState(null, "", nextPath);
  } else {
    window.history.pushState(null, "", nextPath);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
};

