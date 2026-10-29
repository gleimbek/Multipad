import { marked } from 'marked';
import DOMPurify from 'dompurify';
export function renderMarkdown(src) { return DOMPurify.sanitize(marked.parse(src, { gfm: true, breaks: false })); }
