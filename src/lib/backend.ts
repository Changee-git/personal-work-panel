import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import type { AppDatabase, WindowMode } from '../types';
import { emptyDatabase } from '../types';

const STORAGE_KEY = 'personal-work-panel-database-v1';

export async function loadDatabase(): Promise<AppDatabase> {
  if (isTauri()) return invoke<AppDatabase>('load_database');
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyDatabase();
  try {
    return JSON.parse(raw) as AppDatabase;
  } catch {
    return emptyDatabase();
  }
}

export async function saveDatabase(database: AppDatabase): Promise<void> {
  if (isTauri()) await invoke('save_database', { database });
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
}

export async function setNativeWindowMode(mode: WindowMode): Promise<void> {
  if (isTauri()) await invoke('set_window_mode', { mode });
}

export async function hideWindow(): Promise<void> {
  if (isTauri()) await invoke('hide_window');
}

export async function quitApp(): Promise<void> {
  if (isTauri()) await invoke('quit_app');
  else window.close();
}

export async function readAutostartEnabled(): Promise<boolean | null> {
  return isTauri() ? isEnabled() : null;
}

export async function setAutostartEnabled(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  if (enabled) await enable();
  else await disable();
}

export async function createDataBackup(): Promise<string> {
  if (isTauri()) return invoke<string>('create_backup');
  throw new Error('浏览器预览模式不支持创建本地备份，请在桌面应用中使用。');
}

export async function listenForWindowShown(handler: () => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => undefined;
  return listen('window-shown', handler);
}

export async function saveClipboardImage(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const dataBase64 = btoa(binary);
  if (isTauri()) {
    return invoke<string>('save_image', {
      dataBase64,
      mimeType: file.type || 'image/png'
    });
  }
  return URL.createObjectURL(file);
}

export async function exportTask(taskId: string): Promise<string> {
  if (isTauri()) return invoke<string>('export_task_markdown', { taskId });
  throw new Error('浏览器预览模式不支持写入导出文件，请在桌面应用中使用。');
}

export function imageSource(path: string): string {
  if (/^(blob:|data:|https?:)/.test(path)) return path;
  return isTauri() ? convertFileSrc(path) : path;
}
