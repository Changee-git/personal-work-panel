import type { ClipboardEvent, ReactNode } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { imageSource, saveClipboardImage } from '../lib/backend';

export function ImageStrip({ images, onChange, disabled = false }: { images: string[]; onChange: (images: string[]) => void; disabled?: boolean }) {
  const paste = async (event: ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    const paths = await Promise.all(files.map(saveClipboardImage));
    onChange([...images, ...paths]);
  };
  return <div className="image-paste-zone" onPaste={paste} tabIndex={disabled ? -1 : 0}>
    {images.length ? <div className="image-strip">{images.map((src, index) => <figure key={`${src}-${index}`}>
      <img src={imageSource(src)} alt={`配图 ${index + 1}`} />
      {!disabled && <button className="image-remove" onClick={() => onChange(images.filter((_, i) => i !== index))} aria-label="删除图片"><X size={13} /></button>}
    </figure>)}</div> : null}
    {!disabled && <span className="paste-hint"><ImagePlus size={15} /> 在此区域按 Ctrl+V 粘贴图片</span>}
  </div>;
}

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button></header>
      {children}
    </section>
  </div>;
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export const formatDate = (value: string | null, withTime = false) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', withTime ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' } : { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
};
