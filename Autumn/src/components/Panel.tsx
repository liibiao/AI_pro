import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  icon?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function Panel({ title, icon, children, actions, className }: PanelProps) {
  return (
    <section className={['panel', className].filter(Boolean).join(' ')}>
      <header className="panel__header">
        <div className="panel__title">
          {icon ? <span aria-hidden="true">{icon}</span> : null}
          <span>{title}</span>
        </div>
        <div className="panel__actions">{actions ?? <span>•••</span>}</div>
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}
