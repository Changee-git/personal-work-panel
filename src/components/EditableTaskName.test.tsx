// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDatabase } from '../types';

vi.mock('../lib/backend', () => ({
  createDataBackup: vi.fn(async () => 'backup-path'),
  loadDatabase: vi.fn(async () => emptyDatabase()),
  readAutostartEnabled: vi.fn(async () => null),
  saveDatabase: vi.fn(async () => undefined),
  setAutostartEnabled: vi.fn(async () => undefined),
  setNativeWindowMode: vi.fn(async () => undefined)
}));

import { flushPendingSaves, useAppStore } from '../store';
import { EditableTaskName } from './EditableTaskName';

const activeTask = {
  id: 'task-1',
  task_no: 1,
  name: '原项目名称',
  status: 'active' as const,
  created_at: '2026-07-14T08:00:00Z',
  last_progress_at: '2026-07-14T08:00:00Z',
  completed_at: null,
  summary: '',
  summary_images: []
};

describe('项目名称原地编辑', () => {
  beforeEach(() => {
    const db = emptyDatabase();
    db.tasks = [activeTask];
    useAppStore.setState({ db, ready: true });
  });

  afterEach(async () => {
    cleanup();
    await flushPendingSaves();
  });

  it('点击名称后可编辑，并使用 Enter 保存去除首尾空格后的名称', () => {
    render(<EditableTaskName task={useAppStore.getState().db.tasks[0]} />);

    fireEvent.click(screen.getByRole('button', { name: '重命名项目：原项目名称' }));
    const input = screen.getByRole('textbox', { name: '编辑项目名称' });
    fireEvent.change(input, { target: { value: '  新项目名称  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useAppStore.getState().db.tasks[0].name).toBe('新项目名称');
  });

  it('空名称不会覆盖原名称，Escape 会取消编辑', () => {
    const { rerender } = render(<EditableTaskName task={useAppStore.getState().db.tasks[0]} />);
    fireEvent.click(screen.getByRole('button', { name: '重命名项目：原项目名称' }));
    let input = screen.getByRole('textbox', { name: '编辑项目名称' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    expect(useAppStore.getState().db.tasks[0].name).toBe('原项目名称');

    rerender(<EditableTaskName task={useAppStore.getState().db.tasks[0]} />);
    fireEvent.click(screen.getByRole('button', { name: '重命名项目：原项目名称' }));
    input = screen.getByRole('textbox', { name: '编辑项目名称' });
    fireEvent.change(input, { target: { value: '不应保存' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(useAppStore.getState().db.tasks[0].name).toBe('原项目名称');
  });
});