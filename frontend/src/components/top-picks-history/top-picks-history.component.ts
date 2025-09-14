/**
 * Refactored Top Picks History component using shared utilities
 */

import { BaseCard, CardConfig, FilterConfig } from '../../shared/components/base-card';
import { createTable, debounce } from '../../shared/utils/dom-utils';

interface HistoryData {
  snapshot_date: string;
  symbol: string;
  score: number;
}

interface GroupedData {
  date: string;
  rows: Array<{
    symbol: string;
    score: number;
    rank: number;
    delta: number | null;
  }>;
}

export class TopPicksHistoryComponent {
  private card: BaseCard;

  constructor() {
    const config: CardConfig = {
      id: 'topPicksHistory',
      title: 'Top Picks History',
      showRefresh: true,
      showFilters: true,
      style: { marginTop: '12px' },
      filters: [
        { id: 'tphDays', type: 'number', label: 'Days:', value: 7, min: 1, step: 1 },
        { id: 'tphLimit', type: 'number', label: 'Limit:', value: 10, min: 1, step: 1 },
        { id: 'tphSearch', type: 'text', label: 'Filter:', placeholder: 'symbol...' }
      ]
    };

    this.card = new BaseCard(config);
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.card.setRefreshCallback(() => this.render());
    
    // Filter callbacks
    this.card.setFilterCallback('tphDays', debounce(() => this.render(), 100));
    this.card.setFilterCallback('tphLimit', debounce(() => this.render(), 100));
    this.card.setFilterCallback('tphSearch', debounce(() => this.render(), 300));
  }

  public getElement(): HTMLElement {
    return this.card.getElement();
  }

  public async render(): Promise<void> {
    this.card.showLoading();

    try {
      const days = this.card.getFilterValue('tphDays') || 7;
      const limit = this.card.getFilterValue('tphLimit') || 10;
      const search = (this.card.getFilterValue('tphSearch') || '').trim().toUpperCase();

      const response = await fetch(`/api/top-picks/history?days=${encodeURIComponent(String(days))}`);
      const data = await response.json();
      const historyData: HistoryData[] = data?.data || [];

      if (historyData.length === 0) {
        this.card.showEmpty('No history found. Snapshots are created automatically on startup.');
        return;
      }

      const grouped = this.computeRankChanges(historyData);
      const sections = this.createHistorySections(grouped, limit, search);
      
      this.card.setBodyContent(sections.join(''));
      this.card.setHint(`days=${days}, limit=${limit}${search ? `, filter=${search}` : ''}`);

    } catch (error: any) {
      this.card.showError(String(error?.message || error));
    }
  }

  private computeRankChanges(data: HistoryData[]): GroupedData[] {
    const byDate = new Map<string, Array<{ symbol: string; score: number }>>();
    
    // Group by date
    for (const row of data) {
      const date = String(row.snapshot_date).slice(0, 10);
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push({ symbol: row.symbol, score: Number(row.score) });
    }

    // Calculate ranks for each date
    const rankByDate = new Map<string, Map<string, number>>();
    for (const [date, rows] of byDate.entries()) {
      const sorted = rows.slice().sort((a, b) => b.score - a.score);
      const ranks = new Map<string, number>();
      sorted.forEach((row, index) => ranks.set(row.symbol, index + 1));
      rankByDate.set(date, ranks);
    }

    // Calculate deltas
    const dates = Array.from(rankByDate.keys()).sort();
    const result: GroupedData[] = [];

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const prevDate = i > 0 ? dates[i - 1] : null;
      const ranks = rankByDate.get(date)!;
      const prevRanks = prevDate ? rankByDate.get(prevDate)! : null;
      
      const rows = (byDate.get(date) || [])
        .slice()
        .sort((a, b) => (ranks.get(a.symbol)! - ranks.get(b.symbol)!))
        .map(row => {
          const rank = ranks.get(row.symbol)!;
          const delta = prevRanks && prevRanks.has(row.symbol) 
            ? (prevRanks.get(row.symbol)! - rank) 
            : null;
          
          return {
            symbol: row.symbol,
            score: row.score,
            rank,
            delta
          };
        });

      result.push({ date, rows });
    }

    return result;
  }

  private createHistorySections(grouped: GroupedData[], limit: number, search: string): string[] {
    return grouped
      .reverse() // Show most recent first
      .map(group => {
        const filteredRows = group.rows
          .filter(row => !search || String(row.symbol).toUpperCase().includes(search))
          .slice(0, limit);

        if (filteredRows.length === 0) return '';

        const table = this.createHistoryTable(filteredRows);
        
        return `
          <div class="card" style="margin-top:8px">
            <div class="muted">${group.date}</div>
            ${table.outerHTML}
          </div>
        `;
      })
      .filter(section => section.length > 0);
  }

  private createHistoryTable(rows: Array<{ symbol: string; score: number; rank: number; delta: number | null }>): HTMLTableElement {
    const headers = ['Symbol', 'Rank Δ', 'Score'];
    
    const tableRows = rows.map(row => {
      const arrow = this.formatRankChange(row.delta);
      const deltaText = row.delta !== null ? ` (${row.delta > 0 ? '+' : ''}${row.delta})` : '';
      
      return [
        row.symbol,
        `${row.rank}${deltaText} ${arrow}`,
        row.score.toFixed(3)
      ];
    });

    return createTable(headers, tableRows);
  }

  private formatRankChange(delta: number | null): string {
    if (delta === null) return '';
    if (delta > 0) return '▲';
    if (delta < 0) return '▼';
    return '•';
  }
}
