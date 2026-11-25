import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';

function renderInlineFormatting(text: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push(
        <strong key={`b-${keyIdx++}`} className="font-bold text-slate-900 dark:text-slate-50">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push(
        <code
          key={`c-${keyIdx++}`}
          dir="ltr"
          className="px-1.5 py-0.5 rounded bg-slate-200/75 dark:bg-slate-800 font-mono text-[11px] text-slate-800 dark:text-slate-200"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }
  return tokens;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="my-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-900 text-slate-100 overflow-hidden">
      <div className="px-3 py-1.5 bg-slate-800 border-b border-slate-700 flex items-center justify-between text-[10px] text-slate-300">
        <span className="font-mono uppercase">{lang || 'code'}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(code).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'تم النسخ' : 'نسخ الكود'}</span>
        </button>
      </div>
      <pre dir="ltr" className="p-3 overflow-x-auto text-[11px] leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function ChatMarkdownContent({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push(<CodeBlock key={`blk-${blockKey++}`} code={codeLines.join('\n')} lang={lang} />);
      continue;
    }

    // Markdown table
    if (trimmed.startsWith('|') && trimmed.includes('|', 1)) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const rowRaw = lines[i].trim();
        const isSeparator =
          /^\|[\s:|-]+\|$/.test(rowRaw) && !/[a-zA-Z0-9\u0600-\u06FF]/.test(rowRaw);
        if (!isSeparator) {
          const cells = rowRaw
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => c.trim());
          tableRows.push(cells);
        }
        i++;
      }

      if (tableRows.length > 0) {
        const header = tableRows[0];
        const body = tableRows.slice(1);
        blocks.push(
          <div
            key={`blk-${blockKey++}`}
            className="my-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <table className="w-full text-right border-collapse text-[11px]">
              <thead className="bg-slate-100 dark:bg-slate-800/80">
                <tr>
                  {header.map((cell, cIdx) => (
                    <th
                      key={cIdx}
                      className="px-2.5 py-1.5 font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap"
                    >
                      {renderInlineFormatting(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-950/60 border-b last:border-b-0 border-slate-200/70 dark:border-slate-800"
                  >
                    {header.map((_, cIdx) => (
                      <td
                        key={cIdx}
                        className="px-2.5 py-1.5 text-slate-700 dark:text-slate-300 align-top"
                      >
                        {renderInlineFormatting(row[cIdx] || '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h4
          key={`blk-${blockKey++}`}
          className="text-xs font-bold text-slate-900 dark:text-slate-100 pt-1.5"
        >
          {renderInlineFormatting(trimmed.slice(4))}
        </h4>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      blocks.push(
        <h3
          key={`blk-${blockKey++}`}
          className="text-[13px] font-bold text-slate-900 dark:text-slate-100 pt-2 pb-0.5 border-b border-slate-200/80 dark:border-slate-800"
        >
          {renderInlineFormatting(trimmed.replace(/^#{1,2}\s+/, ''))}
        </h3>
      );
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quoteLines.push(lines[i].trim().slice(2));
        i++;
      }
      blocks.push(
        <blockquote
          key={`blk-${blockKey++}`}
          className="border-r-2 border-emerald-500 pr-3 py-1 my-1 text-slate-600 dark:text-slate-300 bg-emerald-50/40 dark:bg-emerald-950/20 rounded-l-md"
        >
          {renderInlineFormatting(quoteLines.join(' '))}
        </blockquote>
      );
      continue;
    }

    // Unordered list
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={`blk-${blockKey++}`} className="list-disc pr-5 space-y-1 my-1">
          {items.map((item, idx) => (
            <li key={idx}>{renderInlineFormatting(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={`blk-${blockKey++}`} className="list-decimal pr-5 space-y-1 my-1">
          {items.map((item, idx) => (
            <li key={idx}>{renderInlineFormatting(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph
    const paraLines: string[] = [trimmed];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('> ') &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    blocks.push(
      <p key={`blk-${blockKey++}`} className="leading-relaxed">
        {renderInlineFormatting(paraLines.join(' '))}
      </p>
    );
  }

  return <div className="space-y-1.5 text-xs leading-relaxed break-words">{blocks}</div>;
}

export function stripMarkdownToPlainText(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\|[\s:|-]+\|$/gm, '')
    .replace(/^\|(.*)\|$/gm, (_, inner: string) =>
      inner
        .split('|')
        .map((c) => c.trim())
        .join(' | ')
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineMarkdownToSafeHtml(text: string): string {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code dir="ltr">$1</code>');
}

function markdownToSafeHtmlBody(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      html.push(`<pre dir="ltr"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    if (trimmed.startsWith('|') && trimmed.includes('|', 1)) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const raw = lines[i].trim();
        const isSep = /^\|[\s:|-]+\|$/.test(raw) && !/[a-zA-Z0-9\u0600-\u06FF]/.test(raw);
        if (!isSep) {
          rows.push(
            raw
              .replace(/^\|/, '')
              .replace(/\|$/, '')
              .split('|')
              .map((c) => c.trim())
          );
        }
        i++;
      }
      if (rows.length > 0) {
        const head = rows[0]
          .map((c) => `<th>${inlineMarkdownToSafeHtml(c)}</th>`)
          .join('');
        const body = rows
          .slice(1)
          .map(
            (r) =>
              `<tr>${rows[0]
                .map((_, idx) => `<td>${inlineMarkdownToSafeHtml(r[idx] || '')}</td>`)
                .join('')}</tr>`
          )
          .join('');
        html.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
        continue;
      }
    }

    if (trimmed.startsWith('### ')) {
      html.push(`<h3>${inlineMarkdownToSafeHtml(trimmed.slice(4))}</h3>`);
      i++;
      continue;
    }
    if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      html.push(`<h2>${inlineMarkdownToSafeHtml(trimmed.replace(/^#{1,2}\s+/, ''))}</h2>`);
      i++;
      continue;
    }
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(`<li>${inlineMarkdownToSafeHtml(lines[i].trim().replace(/^[-*•]\s+/, ''))}</li>`);
        i++;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(`<li>${inlineMarkdownToSafeHtml(lines[i].trim().replace(/^\d+[.)]\s+/, ''))}</li>`);
        i++;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    html.push(`<p>${inlineMarkdownToSafeHtml(trimmed)}</p>`);
    i++;
  }

  return html.join('\n');
}

export function buildPrintableHtmlDocument(params: {
  title: string;
  content: string;
  createdAt?: string;
  projectName?: string;
  attachmentNames?: string[];
  forWord?: boolean;
}): string {
  const dateLabel = params.createdAt
    ? new Date(params.createdAt).toLocaleString('ar-EG')
    : new Date().toLocaleString('ar-EG');
  const attachmentsLine =
    params.attachmentNames && params.attachmentNames.length > 0
      ? `<div class="meta-attachments"><strong>المستندات المرفقة:</strong> ${escapeHtml(
          params.attachmentNames.join('، ')
        )}</div>`
      : '';

  const wordNs = params.forWord
    ? `xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"`
    : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl" ${wordNs}>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(params.title)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body {
      font-family: "IBM Plex Sans Arabic", "Cairo", "Segoe UI", Tahoma, Arial, sans-serif;
      color: #0f172a;
      line-height: 1.75;
      font-size: 13px;
      margin: 0;
      padding: 20px;
      direction: rtl;
    }
    .header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 18px;
    }
    .brand {
      font-size: 11px;
      color: #475569;
      letter-spacing: 0.4px;
    }
    h1 {
      font-size: 18px;
      margin: 4px 0 6px;
      color: #0f172a;
    }
    .meta {
      font-size: 11px;
      color: #475569;
    }
    .meta-attachments {
      margin-top: 8px;
      padding: 6px 10px;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-radius: 6px;
      font-size: 11.5px;
      color: #065f46;
    }
    h2 {
      font-size: 15px;
      margin: 18px 0 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #e2e8f0;
    }
    h3 {
      font-size: 13.5px;
      margin: 14px 0 6px;
    }
    p { margin: 6px 0; }
    ul, ol { margin: 6px 0 10px; padding-right: 22px; }
    li { margin-bottom: 4px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 12px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      text-align: right;
    }
    th {
      background: #f1f5f9;
      font-weight: 700;
    }
    pre {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px;
      font-family: Consolas, Monaco, monospace;
      font-size: 11.5px;
      white-space: pre-wrap;
      direction: ltr;
      text-align: left;
    }
    code {
      font-family: Consolas, Monaco, monospace;
      background: #f1f5f9;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 11.5px;
    }
    .footer {
      margin-top: 28px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      font-size: 10.5px;
      color: #64748b;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">ALHELBAWEY — منصة الهلباوي لبناء الأنظمة الذكية</div>
    <h1>${escapeHtml(params.title)}</h1>
    <div class="meta">
      ${params.projectName ? `المشروع: ${escapeHtml(params.projectName)} &nbsp;|&nbsp; ` : ''}تاريخ التوليد: ${escapeHtml(dateLabel)}
    </div>
    ${attachmentsLine}
  </div>
  <main>
    ${markdownToSafeHtmlBody(params.content)}
  </main>
  <div class="footer">تم التوليد والتوثيق عبر منصة الهلباوي (ALHELBAWEY)</div>
</body>
</html>`;
}

export function downloadBlobFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
