import ReactMarkdown from 'react-markdown';
import './MarkdownMessage.css';

export default function MarkdownMessage({ content, className = '' }) {
  if (!content) return null;

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

