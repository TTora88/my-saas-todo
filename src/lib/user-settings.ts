import { supabase } from "@/src/lib/supabase";

export const DEFAULT_SCREEN_STORAGE_KEY = "doflow_default_screen";
export const SHOW_COMPLETED_STORAGE_KEY = "doflow_show_completed";
export const NEXT_THEMES_STORAGE_KEY = "theme";

export type AppTheme = "light" | "dark" | "system";
export type InitialScreen = "inbox" | "today" | "next" | "calendar";
export type ShowCompletedMode = "open" | "close";

export type UserSettings = {
  theme: AppTheme;
  initial_screen: InitialScreen;
  show_completed: ShowCompletedMode;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: "system",
  initial_screen: "today",
  show_completed: "open",
};

type UserSettingsRow = UserSettings & {
  user_id: string;
  updated_at?: string;
};

function normalizeSettings(row: Partial<UserSettingsRow> | null): UserSettings {
  const theme =
    row?.theme === "light" || row?.theme === "dark" || row?.theme === "system"
      ? row.theme
      : DEFAULT_USER_SETTINGS.theme;
  const initial_screen =
    row?.initial_screen === "inbox" ||
    row?.initial_screen === "today" ||
    row?.initial_screen === "next" ||
    row?.initial_screen === "calendar"
      ? row.initial_screen
      : DEFAULT_USER_SETTINGS.initial_screen;
  const show_completed =
    row?.show_completed === "open" || row?.show_completed === "close"
      ? row.show_completed
      : DEFAULT_USER_SETTINGS.show_completed;

  return { theme, initial_screen, show_completed };
}

export function syncSettingsToLocalStorage(settings: UserSettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DEFAULT_SCREEN_STORAGE_KEY, settings.initial_screen);
    localStorage.setItem(SHOW_COMPLETED_STORAGE_KEY, settings.show_completed);
  } catch {}
}

export function clearSettingsLocalStorage() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(DEFAULT_SCREEN_STORAGE_KEY);
    localStorage.removeItem(SHOW_COMPLETED_STORAGE_KEY);
    localStorage.removeItem(NEXT_THEMES_STORAGE_KEY);
  } catch {}
}

export function applyInitialScreen(
  screen: InitialScreen,
  setMenu: (menu: InitialScreen) => void,
  setTodayTab: (tab: string) => void
) {
  if (screen === "inbox" || screen === "next" || screen === "calendar") {
    setMenu(screen);
    return;
  }
  setMenu("today");
  setTodayTab("all");
}

export async function fetchUserSettings(userId: string): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("theme, initial_screen, show_completed")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("user_settings fetch error:", error.message);
    return null;
  }

  if (!data) return null;
  return normalizeSettings(data);
}

export async function upsertUserSettings(
  userId: string,
  patch: Partial<UserSettings>
): Promise<{ error: Error | null }> {
  const payload = {
    user_id: userId,
    ...patch,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("user_settings").upsert(payload, {
    onConflict: "user_id",
  });

  if (error) {
    console.error("user_settings upsert error:", error.message);
    return { error: new Error(error.message) };
  }

  return { error: null };
}

/** DB에서 설정을 불러오거나 없으면 기본값을 생성 후 반환 */
export async function loadOrCreateUserSettings(userId: string): Promise<UserSettings> {
  const existing = await fetchUserSettings(userId);
  if (existing) return existing;

  const { error } = await upsertUserSettings(userId, DEFAULT_USER_SETTINGS);
  if (error) {
    return DEFAULT_USER_SETTINGS;
  }

  return DEFAULT_USER_SETTINGS;
}
