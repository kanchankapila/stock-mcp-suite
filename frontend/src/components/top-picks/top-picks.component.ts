/**
 * Refactored Top Picks component using shared utilities
 */

import { Api } from '../../app/services/api.service';
import { BaseCard, CardConfig, FilterConfig } from '../../shared/components/base-card';
import { CacheService, SessionCacheService } from '../../shared/services/cache.service';
import { createTable, debounce, formatNumber, formatPercentage, getColorClass } from '../../shared/utils/dom-utils';

export class TopPicksComponent {
  private card: BaseCard;
  private api: Api;
  private cache: CacheService;
  private sessionCache: SessionCacheService;
  private previousRanks = new Map<string, number>();

  constructor() {
    this.api = new Api();
    this.cache = CacheService.getInstance();
    this.sessionCache = SessionCacheService.getInstance();
    
    const config: CardConfig = {
      id: 'topPicks',
      title: 'Top Picks',
      showRefresh: true,
      showFilters: true,
      filters: [
        { id: 'tpDays', type: 'number', label: 'Days:', value: 60, min: 1, step: 1 },
        { id: 'tpLimit', type: 'number', label: 'Limit:', value: 10, min: 1, step: 1 },
        { id: 'tpFilter', type: 'text', label: 'Filter:', placeholder: 'symbol...' },
        { id: 'tpOnlyBuys', type: 'checkbox', label: 'Only BUYs' },
        { id: 'tpShowContrib', type: 'checkbox', label: 'Show contributions' }
      ]
    };

    this.card = new BaseCard(config);
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.card.setRefreshCallback(() => this.render());
    
    // Filter callbacks
    this.card.setFilterCallback('tpDays', debounce(() => this.render(), 100));
    this.card.setFilterCallback('tpLimit', debounce(() => this.render(), 100));
    this.card.setFilterCallback('tpFilter', debounce(() => this.render(), 300));
    this.card.setFilterCallback('tpOnlyBuys', () => this.render());
    this.card.setFilterCallback('tpShowContrib', () => this.render());
  }

  public getElement(): HTMLElement {
    return this.card.getElement();
  }

  public async render(): Promise<void> {
    this.card.showLoading();

    try {
      const days = this.card.getFilterValue('tpDays') || 60;
      const limit = this.card.getFilterValue('tpLimit') || 10;
      const filter = this.card.getFilterValue('tpFilter') || '';
      const onlyBuys = this.card.getFilterValue('tpOnlyBuys') || false;
      const showContrib = this.card.getFilterValue('tpShowContrib') || false;

      // Load previous ranks for comparison
      await this.loadPreviousRanks();

      // Fetch top picks
      const response = await this.api.topPicks(days, limit);
      let picks = response?.data || [];

      // Apply filters
      if (onlyBuys) {
        picks = picks.filter((p: any) => String(p.recommendation || '').toUpperCase() === 'BUY');
      }

      if (filter) {
        const filterLower = filter.toLowerCase();
        picks = picks.filter((p: any) => 
          String(p.symbol || '').toLowerCase().includes(filterLower)
        );
      }

      // Limit results
      picks = picks.slice(0, limit);

      if (picks.length === 0) {
        this.card.showEmpty('No picks found. Try adjusting filters or ingest data first.');
        return;
      }

      // Render table
      const table = this.createTable(picks, showContrib);
      this.card.setBodyContent(table.outerHTML);
      this.card.setHint(`days=${days}, limit=${limit}, total=${response?.meta?.total || picks.length}`);

    } catch (error: any) {
      this.card.showError(String(error?.message || error));
    }
  }

  private async loadPreviousRanks(): Promise<void> {
    try {
      const response = await fetch('/api/top-picks/history?days=2');
      const data = await response.json();
      const rows = data?.data || [];
      
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = rows
        .map((r: any) => String(r.snapshot_date).slice(0, 10))
        .filter((d: string) => d !== today)
        .sort()
        .pop();

      if (yesterday) {
        const yesterdayRows = rows
          .filter((r: any) => String(r.snapshot_date).slice(0, 10) === yesterday)
          .sort((a: any, b: any) => Number(b.score) - Number(a.score));

        this.previousRanks.clear();
        yesterdayRows.forEach((row: any, index: number) => {
          this.previousRanks.set(String(row.symbol).toUpperCase(), index + 1);
        });
      }
    } catch (error) {
      console.warn('Failed to load previous ranks:', error);
    }
  }

  private createTable(picks: any[], showContrib: boolean): HTMLTableElement {
    const headers = [
      'Symbol',
      'Score',
      'Momentum',
      'Sentiment',
      'MC Score',
      ...(showContrib ? ['Contrib'] : []),
      'Recommendation'
    ];

    const rows = picks.map((pick, index) => {
      const momentum = Number(pick.momentum);
      const sentiment = Number(pick.sentiment);
      const mcScore = pick.mcScore === null || pick.mcScore === undefined ? '-' : formatNumber(Number(pick.mcScore), 0);
      const recommendation = String(pick.recommendation || 'HOLD');
      
      // Rank change calculation
      const currentRank = index + 1;
      const previousRank = this.previousRanks.get(String(pick.symbol).toUpperCase());
      const rankChange = previousRank !== undefined ? previousRank - currentRank : null;
      const rankChangeDisplay = this.formatRankChange(rankChange);
      
      // Symbol with rank change
      const symbolDisplay = rankChange !== null ? `${pick.symbol} ${rankChangeDisplay}` : pick.symbol;

      // Contribution bars
      const contribHtml = showContrib ? this.createContributionBars(pick.contrib || {}) : '';

      return [
        symbolDisplay,
        formatNumber(Number(pick.score), 3),
        `<span style="color:${getColorClass(momentum)}">${formatPercentage(momentum)}</span>`,
        `<span style="color:${getColorClass(sentiment)}">${formatNumber(sentiment, 2)}</span>`,
        mcScore,
        ...(showContrib ? [contribHtml] : []),
        `<span style="font-weight:bold; color:${this.getRecommendationColor(recommendation)}">${recommendation}</span>`
      ];
    });

    return createTable(headers, rows);
  }

  private formatRankChange(change: number | null): string {
    if (change === null) return '';
    if (change > 0) return `⬆️(+${change})`;
    if (change < 0) return `⬇️(${change})`;
    return '↔️';
  }

  private getRecommendationColor(recommendation: string): string {
    const rec = recommendation.toUpperCase();
    if (rec === 'BUY') return 'var(--success)';
    if (rec === 'SELL') return 'var(--danger)';
    return 'var(--muted)';
  }

  private createContributionBars(contrib: any): string {
    const momentum = Number(contrib.momentum || 0);
    const sentiment = Number(contrib.sentiment || 0);
    const tech = Number(contrib.tech || 0);
    const options = Number(contrib.options || 0);

    return `
      <div style="display:flex; flex-direction:column; gap:6px">
        ${this.createProgressBar(momentum, 'Momentum')}
        ${this.createProgressBar(sentiment, 'Sentiment')}
        ${this.createProgressBar(tech, 'Tech')}
        ${this.createProgressBar(options, 'Options')}
      </div>
    `;
  }

  private createProgressBar(value: number, label: string): string {
    const percentage = Math.min(100, Math.max(0, Math.abs(value) * 100));
    const color = value >= 0 ? 'var(--success)' : 'var(--danger)';
    const position = value >= 0 ? 'left:50%' : `left:calc(50% - ${percentage}%)`;
    
    return `
      <div style="display:flex; align-items:center; gap:6px">
        <div class="muted" style="width:60px">${label}</div>
        <div style="position:relative; flex:1; height:10px; background:var(--panel-2); border:1px solid var(--border); border-radius:999px">
          <div style="position:absolute; ${position}; top:0; bottom:0; width:${percentage}%; background:${color}"></div>
        </div>
      </div>
    `;
  }
}
