export type TaskStatus = 'active' | 'completed';
export type TodoStatus = 'open' | 'done';
export type IssueStatus = 'open' | 'resolved';
export type AppTab = 'today' | 'ideas' | 'projects';
export type WindowMode = 'main' | 'compact';

export interface Task {
  id: string;
  task_no: number;
  name: string;
  status: TaskStatus;
  created_at: string;
  last_progress_at: string;
  completed_at: string | null;
  summary: string;
  summary_images: string[];
}

export interface Todo {
  id: string;
  todo_no: number;
  task_id: string;
  content: string;
  images: string[];
  status: TodoStatus;
  created_at: string;
  completed_at: string | null;
  order: number;
}

export interface Issue {
  id: string;
  task_id: string;
  title: string;
  detail: string;
  images: string[];
  status: IssueStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface Idea {
  id: string;
  content: string;
  images: string[];
  created_at: string;
}

export interface AppDatabase {
  version: number;
  counters: { next_task_no: number; next_todo_no: Record<string, number> };
  settings: { last_main_tab: AppTab; window_mode: WindowMode; autostart: boolean };
  tasks: Task[];
  todos: Todo[];
  issues: Issue[];
  ideas: Idea[];
}

export const emptyDatabase = (): AppDatabase => ({
  version: 1,
  counters: { next_task_no: 1, next_todo_no: {} },
  settings: { last_main_tab: 'today', window_mode: 'main', autostart: false },
  tasks: [],
  todos: [],
  issues: [],
  ideas: []
});

export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
export const uid = () => crypto.randomUUID();
