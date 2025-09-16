/**
 * Refactored main.ts using modular components
 */

import { TopPicksComponent } from './components/top-picks/top-picks.component';
import { TopPicksHistoryComponent } from './components/top-picks-history/top-picks-history.component';
import { Api } from './app/services/api.service';
import { CacheService, SessionCacheService } from './shared/services/cache.service';
import { createElement, createFlexContainer, createButton, debounce } from './shared/utils/dom-utils';

// Global services
const api = new Api();
const cache = CacheService.getInstance();
const sessionCache = SessionCacheService.getInstance();

// Components
let topPicksComponent: TopPicksComponent;
let topPicksHistoryComponent: TopPicksHistoryComponent;

// Page state
let currentPage: 'overview' | 'insight' | 'ai' | 'watchlist' | 'portfolio' | 'alerts' | 'settings' | 'health' = 'overview';

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

function initializeApp() {
  createHeader();
  createMainContent();
  createPageTabs();
  initializeComponents();
  setupEventListeners();
  loadInitialData();
}

function createHeader() {
  const header = createElement('header');
  header.innerHTML = `
    <div class="badge">Stock • RAG • MCP</div>
    <div class="muted">Demo dashboard (server on <span class="mono">http://localhost:4010</span>)</div>
  `;
  document.body.insertBefore(header, document.body.firstChild);
}

function createMainContent() {
  const appContainer = createElement('div', '', '');
  appContainer.id = 'app';
  
  const main = createElement('main', 'content');
  const container = createElement('div', 'container');
  main.appendChild(container);
  appContainer.appendChild(main);
  
  document.body.appendChild(appContainer);
}

function createPageTabs() {
  const container = document.querySelector('main.content .container');
  if (!container) return;

  // Page tabs
  const tabBar = createElement('div', 'pagetabs');
  tabBar.setAttribute('aria-label', 'Page Tabs');
  tabBar.innerHTML = `
    <div class="tab" data-page="overview" role="button" tabindex="0">Market Overview</div>
    <div class="tab" data-page="insight" role="button" tabindex="0">Stock Insight</div>
    <div class="tab" data-page="ai" role="button" tabindex="0">AI</div>
    <div class="tab" data-page="watchlist" role="button" tabindex="0">Watchlist</div>
    <div class="tab" data-page="alerts" role="button" tabindex="0">Alerts</div>
    <div class="tab" data-page="health" role="button" tabindex="0">Health</div>
  `;
  container.insertBefore(tabBar, container.firstChild);

  // Hero navigation
  const hero = createElement('div', 'card');
  hero.style.marginTop = '12px';
  hero.innerHTML = `
    <div class="muted">Quick Navigation</div>
    <div class="flex" style="gap:10px; margin-top:8px; flex-wrap:wrap">
      <a href="#/overview" class="btn" style="font-weight:700">Market Overview</a>
      <a href="#/insight" class="btn" style="font-weight:700">Stock Insight</a>
      <a href="#/ai" class="btn" style="font-weight:700">AI</a>
      <a href="#/watchlist" class="btn" style="font-weight:700">Watchlist</a>
      <a href="#/alerts" class="btn" style="font-weight:700">Alerts</a>
    </div>
  `;
  container.insertBefore(hero, tabBar.nextSibling);

  // Tab event listeners
  const tabs = tabBar.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const page = (tab as HTMLElement).dataset.page as any;
      if (page) setPage(page);
    });
  });
}

function initializeComponents() {
  // Initialize Top Picks components
  topPicksComponent = new TopPicksComponent();
  topPicksHistoryComponent = new TopPicksHistoryComponent();

  // Add components to container
  const container = document.querySelector('main.content .container');
  if (container) {
    container.appendChild(topPicksComponent.getElement());
    container.appendChild(topPicksHistoryComponent.getElement());
  }
}

function setupEventListeners() {
  // Hash change listener
  window.addEventListener('hashchange', () => {
    const page = parseHash();
    setPage(page);
  });

  // Initial page load
  const page = parseHash();
  setPage(page);
}

function parseHash(): typeof currentPage {
  const hash = (location.hash || '').toLowerCase();
  if (hash.startsWith('#/insight')) return 'insight';
  if (hash.startsWith('#/ai')) return 'ai';
  if (hash.startsWith('#/watchlist')) return 'watchlist';
  if (hash.startsWith('#/portfolio')) return 'portfolio';
  if (hash.startsWith('#/alerts')) return 'alerts';
  if (hash.startsWith('#/settings')) return 'settings';
  if (hash.startsWith('#/health')) return 'health';
  return 'overview';
}

function setPage(page: typeof currentPage) {
  currentPage = page;
  
  try {
    localStorage.setItem('currentPage', page);
  } catch (error) {
    console.warn('Failed to save page state:', error);
  }

  // Update tab states
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    const isActive = (tab as HTMLElement).dataset.page === page;
    tab.classList.toggle('active', isActive);
  });

  // Show/hide components based on page
  updateComponentVisibility();
}

function updateComponentVisibility() {
  const topPicksEl = topPicksComponent.getElement();
  const topPicksHistoryEl = topPicksHistoryComponent.getElement();

  // Show/hide based on current page
  const showOnOverview = ['overview'].includes(currentPage);
  const showOnInsight = ['insight'].includes(currentPage);

  topPicksEl.style.display = showOnOverview ? '' : 'none';
  topPicksHistoryEl.style.display = showOnOverview ? '' : 'none';

  // Add other component visibility logic here
}

function loadInitialData() {
  // Load initial data based on current page
  if (currentPage === 'overview') {
    topPicksComponent.render();
    topPicksHistoryComponent.render();
  }
}

// Export for global access if needed
(window as any).stockApp = {
  api,
  cache,
  sessionCache,
  setPage,
  currentPage: () => currentPage
};
