import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useAppStore } from '../store';
import type { Task } from '../types';

interface EditableTaskNameProps {
  task: Task;
}

export function EditableTaskName({ task }: EditableTaskNameProps) {
  const renameTask = useAppStore((state) => state.renameTask);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const editable = task.status === 'active';

  useEffect(() => {
    if (!editing) setDraft(task.name);
  }, [editing, task.name]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const save = () => {
    const nextName = draft.trim();
    if (nextName) renameTask(task.id, nextName);
    else setDraft(task.name);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(task.name);
    setEditing(false);
  };

  if (!editable) return <span>{task.name}</span>;

  if (editing) {
    return <input
      ref={inputRef}
      className="task-name-input"
      value={draft}
      aria-label="编辑项目名称"
      onChange={(event) => setDraft(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onBlur={save}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          save();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
        }
      }}
    />;
  }

  return <button
    type="button"
    className="editable-task-name"
    title="点击重命名项目"
    aria-label={`重命名项目：${task.name}`}
    onClick={(event) => {
      event.stopPropagation();
      setDraft(task.name);
      setEditing(true);
    }}
  >
    <span>{task.name}</span>
    <Pencil size={14} aria-hidden="true" />
  </button>;
}