// Advanced Visualization Module for Stock Analytics Hub
class StockVisualizations {
  constructor() {
    this.charts = new Map();
    this.defaultColors = {
      primary: '#667eea',
      secondary: '#764ba2',
      success: '#4facfe',
      warning: '#fa709a',
      danger: '#ff6b6b',
      info: '#00f2fe',
      accent: '#fee140'
    };
  }

  // Initialize Chart.js defaults
  initializeChartDefaults() {
    if (typeof Chart === 'undefined' || !Chart.defaults) {
      console.warn('StockVisualizations: Chart.js not detected; skipping defaults configuration.');
      return;
    }

    const defaults = Chart.defaults;
    defaults.color = '#e2e8f0';
    defaults.backgroundColor = 'rgba(102, 126, 234, 0.1)';
    defaults.borderColor = 'rgba(102, 126, 234, 0.3)';

    if (defaults.plugins) {
      defaults.plugins.legend = defaults.plugins.legend || {};
      defaults.plugins.legend.labels = defaults.plugins.legend.labels || {};
      defaults.plugins.legend.labels.color = '#e2e8f0';
    }

    if (defaults.scales) {
      if (defaults.scales.linear) {
        defaults.scales.linear.grid = defaults.scales.linear.grid || {};
        defaults.scales.linear.grid.color = 'rgba(255, 255, 255, 0.1)';
        defaults.scales.linear.ticks = defaults.scales.linear.ticks || {};
        defaults.scales.linear.ticks.color = '#9ca3af';
      }
      if (defaults.scales.category) {
        defaults.scales.category.grid = defaults.scales.category.grid || {};
        defaults.scales.category.grid.color = 'rgba(255, 255, 255, 0.1)';
        defaults.scales.category.ticks = defaults.scales.category.ticks || {};
        defaults.scales.category.ticks.color = '#9ca3af';
      }
    }
  }

  // Create price chart with candlestick visualization
  createPriceChart(canvasId, data) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx || !data) return null;

    // Destroy existing chart
    if (this.charts.has(canvasId)) {
      this.charts.get(canvasId).destroy();
    }

    const prices = data.map(d => ({
      x: new Date(d.date),
      y: d.close || d.price
    }));

    const volumes = data.map(d => ({
      x: new Date(d.date),
      y: d.volume || 0
    }));

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [{
          label: 'Price',
          data: prices,
          borderColor: this.defaultColors.primary,
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: this.defaultColors.primary,
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                return `Price: $${context.parsed.y.toFixed(2)}`;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'day',
              displayFormats: {
                day: 'MMM dd'
              }
            },
            grid: {
              display: false
            }
          },
          y: {
            beginAtZero: false,
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          }
        },
        elements: {
          point: {
            radius: 0
          }
        }
      }
    });

    this.charts.set(canvasId, chart);
    return chart;
  }

  // Create volume chart
  createVolumeChart(canvasId, data) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx || !data) return null;

    if (this.charts.has(canvasId)) {
      this.charts.get(canvasId).destroy();
    }

    const volumes = data.map(d => ({
      x: new Date(d.date),
      y: d.volume || 0
    }));

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        datasets: [{
          label: 'Volume',
          data: volumes,
          backgroundColor: volumes.map((_, i) => 
            i > 0 && volumes[i].y > volumes[i-1].y ? 
            'rgba(74, 222, 128, 0.6)' : 'rgba(239, 68, 68, 0.6)'
          ),
          borderColor: volumes.map((_, i) => 
            i > 0 && volumes[i].y > volumes[i-1].y ? 
            'rgb(74, 222, 128)' : 'rgb(239, 68, 68)'
          ),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            callbacks: {
              label: function(context) {
                return `Volume: ${context.parsed.y.toLocaleString()}`;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'day'
            },
            grid: {
              display: false
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          }
        }
      }
    });

    this.charts.set(canvasId, chart);
    return chart;
  }

  // Create sentiment gauge using ApexCharts
  createSentimentGauge(containerId, sentimentScore) {
    if (typeof ApexCharts === 'undefined') {
      console.warn('ApexCharts not loaded');
      return;
    }

    const score = Math.round((sentimentScore || 0) * 100);
    const color = score >= 70 ? '#4ade80' : score >= 40 ? '#fbbf24' : '#ef4444';

    const options = {
      series: [score],
      chart: {
        height: 150,
        type: 'radialBar',
        background: 'transparent'
      },
      plotOptions: {
        radialBar: {
          startAngle: -135,
          endAngle: 135,
          hollow: {
            margin: 0,
            size: '70%',
            background: 'transparent',
            position: 'front',
          },
          track: {
            background: 'rgba(255,255,255,0.1)',
            strokeWidth: '67%',
          },
          dataLabels: {
            show: true,
            name: {
              offsetY: -10,
              show: true,
              color: '#888',
              fontSize: '12px'
            },
            value: {
              formatter: function(val) {
                return parseInt(val) + '%';
              },
              color: '#fff',
              fontSize: '20px',
              show: true,
            }
          }
        }
      },
      fill: {
        colors: [color]
      },
      stroke: {
        lineCap: 'round'
      },
      labels: ['Sentiment']
    };

    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = ''; // Clear existing content
      const chart = new ApexCharts(container, options);
      chart.render();
      return chart;
    }
  }

  // Create heatmap using D3.js
  createPerformanceHeatmap(containerId, data) {
    if (typeof d3 === 'undefined') {
      console.warn('D3.js not loaded');
      return;
    }

    const container = d3.select(`#${containerId}`);
    container.selectAll('*').remove(); // Clear existing content

    const margin = { top: 20, right: 20, bottom: 30, left: 40 };
    const width = container.node().clientWidth - margin.left - margin.right;
    const height = 200 - margin.top - margin.bottom;

    const svg = container
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Sample heatmap data if none provided
    const heatmapData = data || [
      { day: 'Mon', hour: '9AM', value: 0.2 },
      { day: 'Mon', hour: '12PM', value: 0.5 },
      { day: 'Mon', hour: '3PM', value: -0.1 },
      { day: 'Tue', hour: '9AM', value: 0.8 },
      { day: 'Tue', hour: '12PM', value: 0.3 },
      { day: 'Tue', hour: '3PM', value: 0.6 },
      { day: 'Wed', hour: '9AM', value: -0.3 },
      { day: 'Wed', hour: '12PM', value: 0.1 },
      { day: 'Wed', hour: '3PM', value: 0.4 }
    ];

    const days = [...new Set(heatmapData.map(d => d.day))];
    const hours = [...new Set(heatmapData.map(d => d.hour))];

    const xScale = d3.scaleBand()
      .domain(days)
      .range([0, width])
      .padding(0.1);

    const yScale = d3.scaleBand()
      .domain(hours)
      .range([height, 0])
      .padding(0.1);

    const colorScale = d3.scaleLinear()
      .domain([-1, 0, 1])
      .range(['#ef4444', '#6b7280', '#4ade80']);

    svg.selectAll('.heatmap-rect')
      .data(heatmapData)
      .enter()
      .append('rect')
      .attr('class', 'heatmap-rect')
      .attr('x', d => xScale(d.day))
      .attr('y', d => yScale(d.hour))
      .attr('width', xScale.bandwidth())
      .attr('height', yScale.bandwidth())
      .attr('fill', d => colorScale(d.value))
      .attr('opacity', 0.8);

    // Add axes
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .style('fill', '#9ca3af');

    svg.append('g')
      .call(d3.axisLeft(yScale))
      .selectAll('text')
      .style('fill', '#9ca3af');
  }

  // Create portfolio pie chart
  createPortfolioChart(containerId, portfolioData) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`StockVisualizations: container "${containerId}" not found; skipping portfolio chart.`);
      return;
    }

    if (!portfolioData || !portfolioData.length) {
      container.innerHTML = '<p class="text-gray-400 text-center">No portfolio data available</p>';
      return;
    }

    if (typeof ApexCharts === 'undefined') {
      console.warn('ApexCharts not loaded');
      return;
    }

    const options = {
      series: portfolioData.map(item => item.value),
      chart: {
        type: 'donut',
        height: 250,
        background: 'transparent'
      },
      labels: portfolioData.map(item => item.symbol),
      colors: ['#667eea', '#764ba2', '#4facfe', '#00f2fe', '#fa709a', '#fee140'],
      plotOptions: {
        pie: {
          donut: {
            size: '65%'
          }
        }
      },
      dataLabels: {
        enabled: true,
        style: {
          colors: ['#fff']
        }
      },
      legend: {
        position: 'bottom',
        labels: {
          colors: '#e2e8f0'
        }
      },
      tooltip: {
        theme: 'dark',
        y: {
          formatter: function(val) {
            return '$' + val.toLocaleString();
          }
        }
      }
    };

    container.innerHTML = '';
    const chart = new ApexCharts(container, options);
    chart.render();
    return chart;
  }

  // Update metrics display
  updateMetrics(data) {
    const metricsGrid = document.getElementById('metrics-grid');
    if (!metricsGrid || !data) return;

    const metrics = [
      { label: 'Current Price', value: data.currentPrice, format: 'currency', icon: 'fas fa-dollar-sign', color: 'text-green-400' },
      { label: 'Change', value: data.change, format: 'percentage', icon: 'fas fa-arrow-trend-up', color: data.change >= 0 ? 'text-green-400' : 'text-red-400' },
      { label: 'Volume', value: data.volume, format: 'number', icon: 'fas fa-chart-bar', color: 'text-blue-400' },
      { label: 'Market Cap', value: data.marketCap, format: 'currency', icon: 'fas fa-building', color: 'text-purple-400' },
      { label: 'P/E Ratio', value: data.peRatio, format: 'decimal', icon: 'fas fa-calculator', color: 'text-yellow-400' },
      { label: '52W High', value: data.high52w, format: 'currency', icon: 'fas fa-arrow-up', color: 'text-green-400' },
      { label: '52W Low', value: data.low52w, format: 'currency', icon: 'fas fa-arrow-down', color: 'text-red-400' },
      { label: 'RSI', value: data.rsi, format: 'decimal', icon: 'fas fa-wave-square', color: 'text-cyan-400' }
    ];

    metricsGrid.innerHTML = metrics.map(metric => `
      <div class="flex items-center justify-between p-3 bg-gray-800 bg-opacity-50 rounded-lg">
        <div class="flex items-center space-x-3">
          <i class="${metric.icon} ${metric.color}"></i>
          <span class="text-sm text-gray-300">${metric.label}</span>
        </div>
        <span class="font-semibold ${metric.color}">
          ${this.formatValue(metric.value, metric.format)}
        </span>
      </div>
    `).join('');
  }

  // Format values based on type
  formatValue(value, format) {
    if (value === null || value === undefined) return 'N/A';
    
    switch (format) {
      case 'currency':
        return '$' + Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 'percentage':
        return (value >= 0 ? '+' : '') + Number(value).toFixed(2) + '%';
      case 'number':
        return Number(value).toLocaleString();
      case 'decimal':
        return Number(value).toFixed(2);
      default:
        return value;
    }
  }

  // Update technical indicators display
  updateTechnicalIndicators(indicators) {
    const container = document.getElementById('technical-indicators');
    if (!container || !indicators) return;

    const indicatorsList = [
      { name: 'RSI', value: indicators.rsi, threshold: { bullish: 30, bearish: 70 } },
      { name: 'MACD', value: indicators.macd, threshold: { bullish: 0, bearish: 0 } },
      { name: 'SMA 20', value: indicators.sma20, current: indicators.currentPrice },
      { name: 'EMA 50', value: indicators.ema50, current: indicators.currentPrice }
    ];

    container.innerHTML = indicatorsList.map(indicator => {
      let signal = 'NEUTRAL';
      let signalColor = 'text-gray-400';
      
      if (indicator.threshold) {
        if (indicator.value < indicator.threshold.bullish) {
          signal = 'BULLISH';
          signalColor = 'text-green-400';
        } else if (indicator.value > indicator.threshold.bearish) {
          signal = 'BEARISH';
          signalColor = 'text-red-400';
        }
      } else if (indicator.current && indicator.value) {
        if (indicator.current > indicator.value) {
          signal = 'ABOVE';
          signalColor = 'text-green-400';
        } else {
          signal = 'BELOW';
          signalColor = 'text-red-400';
        }
      }

      return `
        <div class="flex justify-between items-center">
          <span class="text-sm text-gray-300">${indicator.name}</span>
          <div class="text-right">
            <div class="text-sm font-medium text-white">${this.formatValue(indicator.value, 'decimal')}</div>
            <div class="text-xs ${signalColor}">${signal}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Cleanup method
  destroy() {
    this.charts.forEach(chart => {
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
    });
    this.charts.clear();
  }
}

// Initialize visualizations
window.stockVisualizations = new StockVisualizations();
window.stockVisualizations.initializeChartDefaults();

export default StockVisualizations;
