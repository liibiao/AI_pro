import type { ReactNode } from 'react';
import { classNames } from '../utils/classNames';

interface ToolbarButtonProps {
  active?: boolean;
  children: ReactNode;
  icon: string;
  onClick?: () => void;
  title?: string;
}

export function ToolbarButton({ active, children, icon, onClick, title }: ToolbarButtonProps) {
  return (
    <button
      className={classNames('toolbar-button', active && 'toolbar-button--active')}
      onClick={onClick}
      title={title}
      type="button"
    >
      <span className="toolbar-button__icon" aria-hidden="true">
        {icon}
      </span>
      <span>{children}</span>
    </button>
  );
}
