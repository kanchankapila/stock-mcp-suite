/**
 * Shared DOM utilities for frontend components
 */

export function createElement(tag: string, className?: string, innerHTML?: string): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (innerHTML) element.innerHTML = innerHTML;
  return element;
}

export function createInput(type: string, id: string, placeholder?: string, value?: string): HTMLInputElement {
  const input = createElement('input') as HTMLInputElement;
  input.type = type;
  input.id = id;
  if (placeholder) input.placeholder = placeholder;
  if (value) input.value = value;
  return input;
}

export function createLabel(text: string, className = 'muted'): HTMLElement {
  const label = createElement('span', className);
  label.textContent = text;
  return label;
}

export function createButton(text: string, className = 'btn', id?: string): HTMLButtonElement {
  const button = createElement('button', className) as HTMLButtonElement;
  button.textContent = text;
  if (id) button.id = id;
  return button;
}

export function createFlexContainer(children: HTMLElement[], gap = '8px', alignItems = 'center'): HTMLElement {
  const container = createElement('div');
  container.style.display = 'flex';
  container.style.gap = gap;
  container.style.alignItems = alignItems;
  children.forEach(child => container.appendChild(child));
  return container;
}

export function createTable(headers: string[], rows: string[][]): HTMLTableElement {
  const table = createElement('table') as HTMLTableElement;
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  
  const thead = createElement('thead');
  const headerRow = createElement('tr');
  headers.forEach(header => {
    const th = createElement('th');
    th.textContent = header;
    th.style.padding = '4px';
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  const tbody = createElement('tbody');
  rows.forEach(row => {
    const tr = createElement('tr');
    row.forEach(cell => {
      const td = createElement('td');
      td.innerHTML = cell;
      td.style.padding = '4px';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  
  return table;
}

export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
  let timeout: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  }) as T;
}

export function formatNumber(value: number, decimals = 2): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : '-';
}

export function formatPercentage(value: number, decimals = 1): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(decimals)}%` : '-';
}

export function getColorClass(value: number, positiveColor = 'var(--success)', negativeColor = 'var(--danger)'): string {
  return value >= 0 ? positiveColor : negativeColor;
}

export function createProgressBar(value: number, label: string, maxWidth = 100): string {
  const percentage = Math.min(100, Math.max(0, Math.abs(value) * 100));
  const color = value >= 0 ? 'var(--success)' : 'var(--danger)';
  const position = value >= 0 ? 'left:50%' : `left:calc(50% - ${percentage}%)`;
  
  return `
    <div style="display:flex; align-items:center; gap:6px;">
      <div class="muted" style="width:60px">${label}</div>
      <div style="position:relative; flex:1; height:10px; background:var(--panel-2); border:1px solid var(--border); border-radius:999px">
        <div style="position:absolute; ${position}; top:0; bottom:0; width:${percentage}%; background:${color}"></div>
      </div>
    </div>
  `;
}
