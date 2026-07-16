import { useEffect, useState } from 'react';
import {
  Brain,
  ChevronDown,
  ChevronUp,
  FolderKanban,
  Minus,
  PanelTop,
  Power,
  Settings,
  Sparkles,
  X
} from 'lucide-react';
import { hideWindow, listenForWindowShown, quitApp } from './lib/backend';
import { flushPendingSaves, useAppStore } from './store';
import type { AppTab } from './types';
import { IdeasView } from './components/IdeasView';
import { ProjectsView } from './components/ProjectsView';
import { TodayFinishedModal, TodayView } from './components/TodayView';
import { Modal } from './components/Common';
import { MarkdownExportSettings } from './components/MarkdownExportSettings';
import './styles.css';
import './motion.css';

const tabs: { id: AppTab; label: string; icon: typeof Brain }[] = [
  { id: 'today', label: '今日待办', icon: PanelTop },
  { id: 'ideas', label: '灵感', icon: Sparkles },
  { id: 'projects', label: '项目空间', icon: FolderKanban }
];

export default function App() {
  const { initialize, ready, tab, setTab, db, setWindowMode } = useAppStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quitting, setQuitting] = useState(false);

  const closeApp = async () => {
    if (quitting) return;
    setQuitting(true);
    try {
      await flushPendingSaves();
      await quitApp();
    } catch (error) {
      console.error('退出工作面板失败', error);
      setQuitting(false);
    }
  };

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    let disposed = false;
    let stopListening: () => void = () => undefined;
    void listenForWindowShown(() => useAppStore.getState().handleWindowShown())
      .then((unlisten) => {
        if (disposed) unlisten();
        else stopListening = unlisten;
      });
    return () => {
      disposed = true;
      stopListening();
    };
  }, []);

  if (!ready) {
    return <div className="app-loading">
      <div className="loading-orbit" />
      <span>正在载入工作面板</span>
    </div>;
  }

  const compact = db.settings.window_mode === 'compact';
  return <div className={`app-shell ${compact ? 'compact-mode' : 'main-mode'}`}>
    <div className="ambient ambient-one" />
    <div className="ambient ambient-two" />
    <header className="app-chrome" data-tauri-drag-region>
      <div className="brand">
        <div className="brand-mark"><Brain size={18} /></div>
        <div><strong>WORKBENCH</strong><span>个人工作面板</span></div>
      </div>
      <div className="window-actions">
        <button
          className="chrome-button square"
          onClick={() => setSettingsOpen(true)}
          title="应用设置"
          aria-label="应用设置"
        >
          <Settings size={17} />
        </button>
        <button
          className="chrome-button"
          onClick={() => void setWindowMode(compact ? 'main' : 'compact')}
          title={compact ? '展开主视图' : '收起为小窗'}
        >
          {compact ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          <span>{compact ? '展开' : '收起'}</span>
        </button>
        <button
          className="chrome-button square"
          onClick={() => void hideWindow()}
          title="隐藏到系统托盘"
          aria-label="隐藏到系统托盘"
        >
          <Minus size={18} />
        </button>
        <button
          className="chrome-button square close-button"
          onClick={() => void closeApp()}
          title="退出应用"
          aria-label="退出应用"
          disabled={quitting}
        >
          <X size={18} />
        </button>
      </div>
    </header>
    <div className="app-body">
      <nav className="primary-nav">
        {tabs.map(({ id, label, icon: Icon }) => <button
          key={id}
          className={tab === id ? 'active' : ''}
          onClick={() => setTab(id)}
        >
          <Icon size={18} />
          <span>{label}</span>
          {tab === id && <i />}
        </button>)}
      </nav>
      <main className="content-stage">
        {tab === 'today' ? <TodayView /> : tab === 'ideas' ? <IdeasView /> : <ProjectsView />}
      </main>
    </div>
    <TodayFinishedModal />
    {settingsOpen && <SystemSettings onClose={() => setSettingsOpen(false)} />}
  </div>;
}

function SystemSettings({ onClose }: { onClose: () => void }) {
  const { db, setAutostart } = useAppStore();
  const [autostartBusy, setAutostartBusy] = useState(false);
  const [message, setMessage] = useState('');

  const toggleAutostart = async () => {
    setAutostartBusy(true);
    setMessage('');
    try {
      await setAutostart(!db.settings.autostart);
    } catch (error) {
      setMessage(`开机启动设置失败：${String(error)}`);
    } finally {
      setAutostartBusy(false);
    }
  };

  return <Modal title="应用设置" onClose={onClose} wide>
    <div className="settings-list">
      <section className="setting-row">
        <div className="setting-icon"><Power size={18} /></div>
        <div className="setting-copy">
          <strong>开机自动启动</strong>
          <span>登录 Windows 后在系统托盘中启动，不占用任务栏。</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={db.settings.autostart}
          aria-label="开机自动启动"
          className={`toggle-switch ${db.settings.autostart ? 'is-on' : ''}`}
          disabled={autostartBusy}
          onClick={() => void toggleAutostart()}
        ><i /></button>
      </section>
      {message && <p className="settings-message error" role="status">{message}</p>}
      <MarkdownExportSettings />
    </div>
    <footer className="modal-actions">
      <button className="primary-button" onClick={onClose}>完成</button>
    </footer>
  </Modal>;
}
