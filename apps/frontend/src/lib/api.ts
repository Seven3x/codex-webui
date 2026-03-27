export const postAction = async <T>(action: string, payload: Record<string, unknown> = {}): Promise<T> => {
  const response = await fetch("/api/action", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ action, payload }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
};

export const fetchRuntime = async <T>(): Promise<T> => {
  const response = await fetch("/api/runtime");
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
};

export const exportThreadEvents = async (threadId: string): Promise<void> => {
  const response = await fetch(`/api/threads/${threadId}/export`);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `thread-${threadId}-events.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

