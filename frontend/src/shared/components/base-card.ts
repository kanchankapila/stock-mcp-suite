/**
 * Base card component for consistent UI elements
 */

import { createElement, createButton, createFlexContainer } from '../utils/dom-utils';

export interface CardConfig {
  id: string;
  title: string;
  className?: string;
  style?: Partial<CSSStyleDeclaration>;
  showRefresh?: boolean;
  showFilters?: boolean;
  filters?: FilterConfig[];
}

export interface FilterConfig {
  id: string;
  type: 'number' | 'text' | 'checkbox';
  label: string;
  placeholder?: string;
  value?: string | number;
  min?: number;
  max?: number;
  step?: number;
}

export class BaseCard {
  private element: HTMLElement;
  private config: CardConfig;
  private refreshCallback?: () => void;
  private filterCallbacks: Map<string, (value: any) => void> = new Map();

  constructor(config: CardConfig) {
    this.config = config;
    this.element = this.createElement();
  }

  private createElement(): HTMLElement {
    const card = createElement('div', 'card', '');
    card.id = this.config.id;
    
    if (this.config.style) {
      Object.assign(card.style, this.config.style);
    }

    // Title
    const title = createElement('div', 'muted', this.config.title);
    card.appendChild(title);

    // Controls container
    const controls = createElement('div', 'flex');
    controls.style.gap = '8px';
    controls.style.marginTop = '6px';
    controls.style.alignItems = 'center';

    // Filters
    if (this.config.showFilters && this.config.filters) {
      this.config.filters.forEach(filter => {
        const filterContainer = this.createFilter(filter);
        controls.appendChild(filterContainer);
      });
    }

    // Refresh button
    if (this.config.showRefresh) {
      const refreshBtn = createButton('Refresh', 'btn-sm', `${this.config.id}Refresh`);
      refreshBtn.addEventListener('click', () => this.refreshCallback?.());
      controls.appendChild(refreshBtn);
    }

    // Hint element
    const hint = createElement('span', 'muted', '');
    hint.id = `${this.config.id}Hint`;
    controls.appendChild(hint);

    card.appendChild(controls);

    // Body container
    const body = createElement('div', 'mono');
    body.id = `${this.config.id}Body`;
    body.style.marginTop = '6px';
    card.appendChild(body);

    return card;
  }

  private createFilter(filter: FilterConfig): HTMLElement {
    const container = createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '6px';

    // Label
    const label = createElement('span', 'muted', filter.label);
    container.appendChild(label);

    // Input
    const input = createElement('input') as HTMLInputElement;
    input.type = filter.type;
    input.id = filter.id;
    if (filter.placeholder) input.placeholder = filter.placeholder;
    if (filter.value !== undefined) input.value = String(filter.value);
    if (filter.min !== undefined) input.min = String(filter.min);
    if (filter.max !== undefined) input.max = String(filter.max);
    if (filter.step !== undefined) input.step = String(filter.step);
    if (filter.type === 'number') input.style.width = '80px';
    if (filter.type === 'text') input.style.width = '120px';

    // Event listener
    const eventType = filter.type === 'checkbox' ? 'change' : 'input';
    input.addEventListener(eventType, () => {
      const value = filter.type === 'checkbox' ? (input as HTMLInputElement).checked : input.value;
      this.filterCallbacks.get(filter.id)?.(value);
    });

    container.appendChild(input);
    return container;
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public setRefreshCallback(callback: () => void): void {
    this.refreshCallback = callback;
  }

  public setFilterCallback(filterId: string, callback: (value: any) => void): void {
    this.filterCallbacks.set(filterId, callback);
  }

  public getFilterValue(filterId: string): any {
    const input = document.getElementById(filterId) as HTMLInputElement;
    if (!input) return null;
    
    if (input.type === 'checkbox') {
      return input.checked;
    } else if (input.type === 'number') {
      return Number(input.value);
    } else {
      return input.value;
    }
  }

  public setBodyContent(content: string): void {
    const body = document.getElementById(`${this.config.id}Body`);
    if (body) body.innerHTML = content;
  }

  public setHint(text: string): void {
    const hint = document.getElementById(`${this.config.id}Hint`);
    if (hint) hint.textContent = text;
  }

  public showLoading(): void {
    this.setBodyContent('<span class="spinner"></span>Loading...');
  }

  public showError(message: string): void {
    this.setBodyContent(`<div class="mono" style="color:#ff6b6b">${message}</div>`);
  }

  public showEmpty(message: string): void {
    this.setBodyContent(`<div class="muted">${message}</div>`);
  }
}
