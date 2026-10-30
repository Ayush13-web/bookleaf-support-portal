const SOURCE_LABEL = { ai: 'AI', rules: 'auto', admin: 'edited', seed: '', pending: 'triaging...' };

export const StatusBadge = ({ status }) => <span className={`badge s-${status.replace(' ', '-')}`}>{status}</span>;

/** Priority badge with a small marker showing whether AI or an admin set it. */
export function PriorityBadge({ priority, source }) {
  return (
    <span>
      <span className={`badge p-${priority}`}>{priority}</span>
      {source && SOURCE_LABEL[source] && <span className="src" title="Who set this value">{SOURCE_LABEL[source]}</span>}
    </span>
  );
}

export function CategoryLabel({ category, source }) {
  return (
    <span>
      {category}
      {source && SOURCE_LABEL[source] && <span className="src" title="Who set this value">{SOURCE_LABEL[source]}</span>}
    </span>
  );
}
