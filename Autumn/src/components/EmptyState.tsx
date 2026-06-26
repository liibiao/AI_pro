import { CreateClapperMark } from './CreateClapperMark';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: string;
}

export function EmptyState({ title, description, icon = '▣' }: EmptyStateProps) {
  const isCreateIcon = icon === 'Create';

  return (
    <div className="empty-state">
      <div
        className={isCreateIcon ? 'empty-state__icon empty-state__icon--create' : 'empty-state__icon'}
        aria-hidden="true"
      >
        {isCreateIcon ? <CreateClapperMark /> : icon}
      </div>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
