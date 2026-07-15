import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDatabase } from './types';

vi.mock('./lib/backend', () => ({
  createDataBackup: vi.fn(async () => 'backup-path'),
  loadDatabase: vi.fn(async () => emptyDatabase()),
  readAutostartEnabled: vi.fn(async () => null),
  saveDatabase: vi.fn(async () => undefined),
  setAutostartEnabled: vi.fn(async () => undefined),
  setNativeWindowMode: vi.fn(async () => undefined)
}));

import { flushPendingSaves, useAppStore } from './store';

const resetStore = () => {
  useAppStore.setState({
    db: emptyDatabase(),
    ready: true,
    tab: 'today',
    filter: 'active',
    selectedTaskId: null,
    todayTaskIds: [],
    todayCompletedIds: [],
    todayFinished: false
  });
};

describe('工作面板业务状态', () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T08:00:00Z'));
  });

  afterEach(async () => {
    await flushPendingSaves();
    vi.useRealTimers();
  });

  it('项目和待办序号删除后仍严格递增，不会复用', () => {
    const store = useAppStore.getState();
    store.createTask('第一个项目');
    const firstTask = useAppStore.getState().db.tasks[0];
    store.deleteTask(firstTask.id);
    store.createTask('第二个项目');

    const secondTask = useAppStore.getState().db.tasks[0];
    expect(firstTask.task_no).toBe(1);
    expect(secondTask.task_no).toBe(2);

    useAppStore.getState().addTodo(secondTask.id, '第一条待办');
    const firstTodo = useAppStore.getState().db.todos[0];
    useAppStore.getState().deleteTodo(firstTodo.id);
    useAppStore.getState().addTodo(secondTask.id, '第二条待办');

    expect(firstTodo.todo_no).toBe(1);
    expect(useAppStore.getState().db.todos[0].todo_no).toBe(2);
  });

  it('待办变更与总结编辑都会更新最近推进时间', () => {
    useAppStore.getState().createTask('时间戳项目');
    const taskId = useAppStore.getState().db.tasks[0].id;
    const createdAt = useAppStore.getState().db.tasks[0].last_progress_at;

    vi.setSystemTime(new Date('2026-07-14T08:01:02Z'));
    useAppStore.getState().addTodo(taskId, '推进事项');
    expect(useAppStore.getState().db.tasks[0].last_progress_at).toBe('2026-07-14T08:01:02Z');

    vi.setSystemTime(new Date('2026-07-14T08:02:03Z'));
    useAppStore.getState().updateSummary(taskId, '阶段结论', []);
    expect(useAppStore.getState().db.tasks[0].last_progress_at).toBe('2026-07-14T08:02:03Z');
    expect(useAppStore.getState().db.tasks[0].last_progress_at).not.toBe(createdAt);
  });

  it('今日待办保留本次会话内刚完成的条目，取消完成时同步移除标记', () => {
    useAppStore.getState().createTask('今日项目');
    const taskId = useAppStore.getState().db.tasks[0].id;
    useAppStore.getState().addTodo(taskId, '今日事项');
    const todoId = useAppStore.getState().db.todos[0].id;

    useAppStore.getState().setTodayTasks([taskId]);
    useAppStore.getState().toggleTodo(todoId);
    expect(useAppStore.getState().db.todos[0].status).toBe('done');
    expect(useAppStore.getState().todayCompletedIds).toContain(todoId);

    useAppStore.getState().toggleTodo(todoId);
    expect(useAppStore.getState().db.todos[0].status).toBe('open');
    expect(useAppStore.getState().todayCompletedIds).not.toContain(todoId);
  });

  it('项目选择器应用完整多选结果，并清理被移出项目的会话完成项', () => {
    useAppStore.getState().createTask('项目 A');
    useAppStore.getState().createTask('项目 B');
    const [taskA, taskB] = useAppStore.getState().db.tasks;
    useAppStore.getState().addTodo(taskA.id, 'A 的待办');
    const todoA = useAppStore.getState().db.todos[0];

    useAppStore.getState().setTodayTasks([taskA.id, taskB.id]);
    useAppStore.getState().toggleTodo(todoA.id);
    useAppStore.getState().setTodayTasks([taskB.id]);

    expect(useAppStore.getState().todayTaskIds).toEqual([taskB.id]);
    expect(useAppStore.getState().todayCompletedIds).toEqual([]);
  });

  it('小窗每次重新呼出时强制回到今日待办，主窗口则保留当前页签', () => {
    const compactDb = emptyDatabase();
    compactDb.settings.window_mode = 'compact';
    useAppStore.setState({ db: compactDb, tab: 'ideas', selectedTaskId: 'detail-id' });
    useAppStore.getState().handleWindowShown();
    expect(useAppStore.getState().tab).toBe('today');
    expect(useAppStore.getState().selectedTaskId).toBeNull();

    const mainDb = emptyDatabase();
    mainDb.settings.window_mode = 'main';
    useAppStore.setState({ db: mainDb, tab: 'ideas' });
    useAppStore.getState().handleWindowShown();
    expect(useAppStore.getState().tab).toBe('ideas');
  });

  it('删除中间待办后新增项仍排在列表末尾且排序值不重复', () => {
    useAppStore.getState().createTask('排序项目');
    const taskId = useAppStore.getState().db.tasks[0].id;
    useAppStore.getState().addTodo(taskId, '待办一');
    useAppStore.getState().addTodo(taskId, '待办二');
    useAppStore.getState().addTodo(taskId, '待办三');

    const secondTodoId = useAppStore.getState().db.todos[1].id;
    useAppStore.getState().deleteTodo(secondTodoId);
    useAppStore.getState().addTodo(taskId, '待办四');

    const todos = useAppStore.getState().db.todos.filter((todo) => todo.task_id === taskId);
    expect(todos.map((todo) => todo.order)).toEqual([0, 2, 3]);
    expect(todos.at(-1)?.content).toBe('待办四');
  });
  it('完成项目时保留传入总结并从今日会话移除该项目', () => {
    useAppStore.getState().createTask('待完成项目');
    const taskId = useAppStore.getState().db.tasks[0].id;
    useAppStore.getState().setTodayTasks([taskId]);

    useAppStore.getState().completeTask(taskId, '已有总结', ['result.png']);
    const task = useAppStore.getState().db.tasks[0];

    expect(task.status).toBe('completed');
    expect(task.summary).toBe('已有总结');
    expect(task.summary_images).toEqual(['result.png']);
    expect(useAppStore.getState().todayTaskIds).toEqual([]);
  });

  it('重命名拒绝空名称和已完成项目，并清理首尾空格', () => {
    useAppStore.getState().createTask('初始名称');
    const taskId = useAppStore.getState().db.tasks[0].id;

    useAppStore.getState().renameTask(taskId, '  新名称  ');
    expect(useAppStore.getState().db.tasks[0].name).toBe('新名称');

    useAppStore.getState().renameTask(taskId, '   ');
    expect(useAppStore.getState().db.tasks[0].name).toBe('新名称');

    useAppStore.getState().completeTask(taskId, '', []);
    useAppStore.getState().renameTask(taskId, '完成后不应修改');
    expect(useAppStore.getState().db.tasks[0].name).toBe('新名称');
  });
});