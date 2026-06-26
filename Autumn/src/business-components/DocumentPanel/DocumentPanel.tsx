import { Panel } from '../../components/Panel';
import type { DocumentItem } from '../../types/pipeline';

interface DocumentPanelProps {
  documents: DocumentItem[];
  onSelectDocument?: (documentId: string) => void;
}

export function DocumentPanel({ documents, onSelectDocument }: DocumentPanelProps) {
  const activeDocument = documents.find((document) => document.active) ?? documents[0];

  if (!activeDocument) {
    return (
      <div className="document-layout document-layout--empty">
        <Panel title="文档" icon="▤" className="document-sidebar">
          <button className="document-new-button" type="button">+ 新建文档</button>
        </Panel>
        <Panel title="" className="document-reader">
          <div className="document-empty">
            <span className="document-empty__icon" aria-hidden="true" />
            <strong>暂无文档</strong>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="document-layout">
      <Panel title="文档" icon="▤" className="document-sidebar">
        <div className="document-list">
          {documents.map((document) => (
            <button
              className={document.active ? 'document-item document-item--active' : 'document-item'}
              key={document.id}
              onClick={() => onSelectDocument?.(document.id)}
              type="button"
            >
              ▫ {document.title}
            </button>
          ))}
          <button className="add-card-button" type="button">
            + 新建文档
          </button>
        </div>
      </Panel>
      <Panel
        title={activeDocument.title}
        className="document-reader"
        actions={<span className="reader-tabs">◉ 易读 | ⌘ Markdown | ✎ 编辑</span>}
      >
        <article className="markdown-preview">
          <header className="markdown-preview__hero">
            <span>Production Spec</span>
            <h2>{activeDocument.body[0]}</h2>
            <p>已由后台漫剧创作库生成，可继续进入故事板和素材生产。</p>
          </header>
          <ul>
            {activeDocument.body.slice(1).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="markdown-preview__footer">
            <span>Script</span>
            <span>Storyboard</span>
            <span>Media</span>
            <span>Timeline</span>
          </div>
        </article>
      </Panel>
    </div>
  );
}
