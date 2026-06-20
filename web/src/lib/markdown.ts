// Minimal, dependency-free markdown -> HTML renderer for agent chat
// transcripts. Handles headings, fenced/inline code, bold/italic,
// links, lists and paragraphs. Output is escaped before formatting.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

export function renderMarkdown(src: string): string {
  const lines = escapeHtml(src ?? "").split(/\r?\n/);
  const out: string[] = [];
  let inCode = false;
  let listOpen = false;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; }
  };
  const closeList = () => { if (listOpen) { out.push("</ul>"); listOpen = false; } };

  for (const line of lines) {
    const fence = line.trimStart().startsWith("```");
    if (fence) {
      if (inCode) { out.push("</code></pre>"); inCode = false; }
      else { flushPara(); closeList(); out.push("<pre><code>"); inCode = true; }
      continue;
    }
    if (inCode) { out.push(line + "\n"); continue; }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { flushPara(); closeList(); const lvl = heading[1].length; out.push(`<h${lvl}>${inline(heading[2])}</h${lvl}>`); continue; }

    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) { flushPara(); if (!listOpen) { out.push("<ul>"); listOpen = true; } out.push(`<li>${inline(li[1])}</li>`); continue; }

    if (line.trim() === "") { flushPara(); closeList(); continue; }
    para.push(line.trim());
  }
  if (inCode) out.push("</code></pre>");
  flushPara(); closeList();
  return out.join("\n");
}
