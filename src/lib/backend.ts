import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { open } from '@tauri-apps/plugin-dialog';
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

export interface MarkdownExportResult {
  directory: string;
  fileCount: number;
  files: string[];
}

export async function getDefaultExportDirectory(): Promise<string> {
  if (isTauri()) return invoke<string>('get_default_export_directory');
  return '项目根目录\\export';
}

export async function chooseMarkdownExportDirectory(defaultPath: string): Promise<string | null> {
  if (!isTauri()) return null;
  const selected = await open({
    title: '选择 Markdown 导出文件夹',
    directory: true,
    multiple: false,
    defaultPath
  });
  return typeof selected === 'string' ? selected : null;
}

export async function exportProjectsMarkdown(
  taskIds: string[],
  targetDirectory?: string
): Promise<MarkdownExportResult> {
  if (isTauri()) {
    return invoke<MarkdownExportResult>('export_projects_markdown', {
      taskIds,
      targetDirectory: targetDirectory || null
    });
  }
  throw new Error('浏览器预览模式不支持写入导出文件，请在桌面应用中使用。');
}

export async function exportTask(taskId: string): Promise<string> {
  const result = await exportProjectsMarkdown([taskId]);
  const output = result.files[0];
  if (!output) throw new Error('项目未生成 Markdown 文件。');
  return output;
}

export function imageSource(path: string): string {
  if (/^(blob:|data:|https?:)/.test(path)) return path;
  return isTauri() ? convertFileSrc(path) : path;
}
