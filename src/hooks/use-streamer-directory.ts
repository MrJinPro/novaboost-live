import { useEffect, useState } from "react";
import { loadStreamerDirectory } from "@/lib/streamers-directory-data";
import type { StreamerCardData } from "@/lib/mock-platform";

type UseStreamerDirectoryOptions = {
  pollingIntervalMs?: number;
  enabled?: boolean;
};

export function useStreamerDirectory(options?: UseStreamerDirectoryOptions) {
  const pollingIntervalMs = options?.pollingIntervalMs ?? 15_000;
  const enabled = options?.enabled ?? true;
  const [streamers, setStreamers] = useState<StreamerCardData[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(enabled);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIsInitialLoading(false);
      setIsRefreshing(false);
      return;
    }

    let active = true;
    let inFlight = false;

    const syncStreamers = async (mode: "initial" | "poll") => {
      if (inFlight) {
        return;
      }

      inFlight = true;
      if (mode === "initial") {
        setIsInitialLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        const data = await loadStreamerDirectory();
        if (!active) {
          return;
        }

        setStreamers(data);
        setError(null);
      } catch (nextError) {
        if (active) {
          setError(nextError instanceof Error ? nextError : new Error("Не удалось загрузить каталог стримеров"));
        }
      } finally {
        if (active) {
          if (mode === "initial") {
            setIsInitialLoading(false);
          } else {
            setIsRefreshing(false);
          }
        }

        inFlight = false;
      }
    };

    void syncStreamers("initial");

    const poller = window.setInterval(() => {
      void syncStreamers("poll");
    }, pollingIntervalMs);

    return () => {
      active = false;
      window.clearInterval(poller);
    };
  }, [enabled, pollingIntervalMs]);

  return {
    streamers,
    isInitialLoading,
    isRefreshing,
    error,
  };
}