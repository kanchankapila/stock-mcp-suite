// Advanced Stock Visualization Engine
// Comprehensive charting and data visualization for financial analytics

class StockVisualizationEngine {
  constructor() {
    this.charts = new Map();
    this.colors = {
      primary: '#00d4ff',
      secondary: '#39ff14',
      accent: '#ff1b8d',
      warning: '#ffff00',
      danger: '#ff6b6b',
      success: '#4ade80',
      gradient: {
        blue: ['#00d4ff', '#0984e3'],
        green: ['#39ff14', '#16a34a'],
        pink: ['#ff1b8d', '#be185d'],
        purple: ['#bf00ff', '#7c3aed'],
        yellow: ['#ffff00', '#f59e0b']
      }
    };
    
    this.defaultChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#e2e8f0',
            font: {
              family: 'Inter, sans-serif',
              size: 12,
              weight: '500'
            },
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#ffffff',
          bodyColor: '#e2e8f0',
          borderColor: '#00d4ff',
          borderWidth: 1,
          cornerRadius: 8,
          displayColors: true,
          titleFont: {
            family: 'Inter, sans-serif',
            size: 14,
            weight: '600'
          },
          bodyFont: {
            family: 'Inter, sans-serif',
            size: 12,
            weight: '400'
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
            drawBorder: false
          },
          ticks: {
            color: '#9ca3af',
            font: {
              family: 'Inter, sans-serif',
              size: 11
            }
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
            drawBorder: false
          },
          ticks: {
            color: '#9ca3af',
            font: {
              family: 'Inter, sans-serif',
              size: 11
            }
          }
        }
      }
    };
    
    this.initializeChartDefaults();
    console.log('📊 Stock Visualization Engine initialized');
  }

  initializeChartDefaults() {
    // Set global Chart.js defaults
    if (typeof Chart !== 'undefined') {
      Chart.defaults.font.family = 'Inter, sans-serif';
      Chart.defaults.color = '#e2e8f0';
      Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';
      Chart.defaults.backgroundColor = 'rgba(0, 212, 255, 0.1)';
    }
  }

  // Advanced Candlestick Price Chart
  createPriceChart(elementId, data, options = {}) {
    try {
      const canvas = document.getElementById(elementId);
      if (!canvas) {
        console.error(`Canvas element ${elementId} not found`);
        return null;
      }

      const ctx = canvas.getContext('2d');
      
      // Destroy existing chart
      if (this.charts.has(elementId)) {
        this.charts.get(elementId).destroy();
      }

      // Process data for candlestick chart
      const processedData = this.processPriceData(data);
      
      const chartConfig = {
        type: 'line', // We'll use line chart with custom styling for now
        data: {
          labels: processedData.labels,
          datasets: [{
            label: 'Price',
            data: processedData.prices,
            borderColor: this.colors.primary,
            backgroundColor: this.createGradient(ctx, this.colors.gradient.blue, 'vertical'),
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: this.colors.primary,
            pointHoverBorderColor: '#ffffff',
            pointHoverBorderWidth: 2
          }]
        },
        options: {
          ...this.defaultChartOptions,
          interaction: {
            intersect: false,
            mode: 'index'
          },
          plugins: {
            ...this.defaultChartOptions.plugins,
            tooltip: {
              ...this.defaultChartOptions.plugins.tooltip,
              callbacks: {
                title: (context) => {
                  return `Date: ${context[0].label}`;
                },
                label: (context) => {
                  const value = parseFloat(context.raw).toFixed(2);
                  return `Price: $${value}`;
                },
                afterBody: (context) => {
                  const index = context[0].dataIndex;
                  if (processedData.volumes && processedData.volumes[index]) {
                    return [`Volume: ${this.formatVolume(processedData.volumes[index])}`];
                  }
                  return [];
                }
              }
            },
            annotation: {
              annotations: this.createPriceAnnotations(processedData)
            }
          },
          scales: {
            x: {
              ...this.defaultChartOptions.scales.x,
              type: 'time',
              time: {
                unit: 'day',
                displayFormats: {
                  day: 'MMM DD'
                }
              }
            },
            y: {
              ...this.defaultChartOptions.scales.y,
              position: 'right',
              ticks: {
                ...this.defaultChartOptions.scales.y.ticks,
                callback: (value) => `$${value.toFixed(2)}`
              }
            }
          },
          ...options
        }
      };

      const chart = new Chart(ctx, chartConfig);
      this.charts.set(elementId, chart);
      
      // Add real-time animation
      this.addChartAnimations(chart);
      
      return chart;
    } catch (error) {
      console.error('Error creating price chart:', error);
      return null;
    }
  }

  // Advanced Volume Chart with Color Coding
  createVolumeChart(elementId, data, options = {}) {
    try {
      const canvas = document.getElementById(elementId);
      if (!canvas) {
        console.error(`Canvas element ${elementId} not found`);
        return null;
      }

      const ctx = canvas.getContext('2d');
      
      if (this.charts.has(elementId)) {
        this.charts.get(elementId).destroy();
      }

      const processedData = this.processVolumeData(data);
      
      const chartConfig = {
        type: 'bar',
        data: {
          labels: processedData.labels,
          datasets: [{
            label: 'Volume',
            data: processedData.volumes,
            backgroundColor: processedData.colors,
            borderColor: processedData.borderColors,
            borderWidth: 1,
            borderRadius: 4,
            borderSkipped: false
          }]
        },
        options: {
          ...this.defaultChartOptions,
          plugins: {
            ...this.defaultChartOptions.plugins,
            legend: {
              display: false
            },
            tooltip: {
              ...this.defaultChartOptions.plugins.tooltip,
              callbacks: {
                title: (context) => `Date: ${context[0].label}`,
                label: (context) => {
                  const volume = parseInt(context.raw);
                  return `Volume: ${this.formatVolume(volume)}`;
                },
                afterLabel: (context) => {
                  const index = context.dataIndex;
                  const trend = processedData.trends[index];
                  return `Trend: ${trend === 'up' ? '📈 Bullish' : trend === 'down' ? '📉 Bearish' : '➡️ Neutral'}`;
                }
              }
            }
          },
          scales: {
            x: {
              ...this.defaultChartOptions.scales.x,
              type: 'time',
              time: {
                unit: 'day',
                displayFormats: {
                  day: 'MMM DD'
                }
              }
            },
            y: {
              ...this.defaultChartOptions.scales.y,
              ticks: {
                ...this.defaultChartOptions.scales.y.ticks,
                callback: (value) => this.formatVolume(value)
              }
            }
          },
          ...options
        }
      };

      const chart = new Chart(ctx, chartConfig);
      this.charts.set(elementId, chart);
      
      return chart;
    } catch (error) {
      console.error('Error creating volume chart:', error);
      return null;
    }
  }

  // Advanced Sentiment Gauge using ApexCharts
  createSentimentGauge(elementId, sentimentScore, options = {}) {
    try {
      const element = document.getElementById(elementId);
      if (!element) {
        console.error(`Element ${elementId} not found`);
        return null;
      }

      // Clear existing content
      element.innerHTML = '';
      
      // Normalize sentiment score (0-1) to percentage
      const normalizedScore = Math.max(0, Math.min(100, sentimentScore * 100));
      
      // Determine color based on sentiment
      let color = this.colors.danger;
      if (normalizedScore >= 70) color = this.colors.success;
      else if (normalizedScore >= 40) color = this.colors.warning;
      
      const gaugeOptions = {
        series: [normalizedScore],
        chart: {
          height: 280,
          type: 'radialBar',
          background: 'transparent'
        },
        plotOptions: {
          radialBar: {
            startAngle: -135,
            endAngle: 225,
            hollow: {
              margin: 0,
              size: '70%',
              background: 'transparent',
              image: undefined,
              position: 'front',
              dropShadow: {
                enabled: true,
                top: 3,
                left: 0,
                blur: 4,
                opacity: 0.24
              }
            },
            track: {
              background: 'rgba(255,255,255,0.1)',
              strokeWidth: '67%',
              margin: 0,
              dropShadow: {
                enabled: true,
                top: -3,
                left: 0,
                blur: 4,
                opacity: 0.35
              }
            },
            dataLabels: {
              show: true,
              name: {
                offsetY: -10,
                show: true,
                color: '#e2e8f0',
                fontSize: '17px',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600
              },
              value: {
                formatter: function(val) {
                  return parseInt(val) + '%';
                },
                color: '#ffffff',
                fontSize: '36px',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 700,
                show: true,
              }
            }
          }
        },
        fill: {
          type: 'gradient',
          gradient: {
            shade: 'dark',
            type: 'horizontal',
            shadeIntensity: 0.5,
            gradientToColors: [color],
            inverseColors: true,
            opacityFrom: 1,
            opacityTo: 1,
            stops: [0, 100]
          }
        },
        stroke: {
          lineCap: 'round'
        },
        labels: ['Sentiment'],
        theme: {
          mode: 'dark'
        },
        ...options
      };

      const chart = new ApexCharts(element, gaugeOptions);
      chart.render();
      
      return chart;
    } catch (error) {
      console.error('Error creating sentiment gauge:', error);
      return null;
    }
  }

  // Performance Heatmap using D3.js
  createPerformanceHeatmap(elementId, data = null, options = {}) {
    try {
      const element = document.getElementById(elementId);
      if (!element) {
        console.error(`Element ${elementId} not found`);
        return null;
      }

      // Clear existing content
      element.innerHTML = '';
      
      // Sample heatmap data if none provided
      const heatmapData = data || this.generateSampleHeatmapData();
      
      // Set dimensions
      const margin = { top: 30, right: 30, bottom: 30, left: 100 };
      const width = element.clientWidth - margin.left - margin.right;
      const height = 300 - margin.top - margin.bottom;
      
      // Create SVG
      const svg = d3.select(`#${elementId}`)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
      
      // Create scales
      const xScale = d3.scaleBand()
        .range([0, width])
        .domain(heatmapData.columns)
        .padding(0.05);
      
      const yScale = d3.scaleBand()
        .range([height, 0])
        .domain(heatmapData.rows)
        .padding(0.05);
      
      const colorScale = d3.scaleSequential()
        .interpolator(d3.interpolateRdYlGn)
        .domain(d3.extent(heatmapData.values.flat()));
      
      // Create tooltip
      const tooltip = d3.select('body').append('div')
        .attr('class', 'heatmap-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background', 'rgba(0, 0, 0, 0.8)')
        .style('color', 'white')
        .style('padding', '8px 12px')
        .style('border-radius', '8px')
        .style('font-size', '12px')
        .style('pointer-events', 'none')
        .style('z-index', '1000');
      
      // Create heatmap rectangles
      svg.selectAll()
        .data(heatmapData.data)
        .enter()
        .append('rect')
        .attr('x', d => xScale(d.column))
        .attr('y', d => yScale(d.row))
        .attr('width', xScale.bandwidth())
        .attr('height', yScale.bandwidth())
        .style('fill', d => colorScale(d.value))
        .style('stroke', 'rgba(255, 255, 255, 0.1)')
        .style('stroke-width', 1)
        .on('mouseover', (event, d) => {
          tooltip.transition().duration(200).style('opacity', .9);
          tooltip.html(`${d.row}<br/>${d.column}: ${d.value.toFixed(2)}%`)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', () => {
          tooltip.transition().duration(500).style('opacity', 0);
        });
      
      // Add X axis labels
      svg.append('g')
        .selectAll('text')
        .data(heatmapData.columns)
        .enter()
        .append('text')
        .text(d => d)
        .attr('x', d => xScale(d) + xScale.bandwidth() / 2)
        .attr('y', height + 20)
        .style('text-anchor', 'middle')
        .style('font-size', '11px')
        .style('fill', '#9ca3af')
        .style('font-family', 'Inter, sans-serif');
      
      // Add Y axis labels
      svg.append('g')
        .selectAll('text')
        .data(heatmapData.rows)
        .enter()
        .append('text')
        .text(d => d)
        .attr('x', -10)
        .attr('y', d => yScale(d) + yScale.bandwidth() / 2)
        .style('text-anchor', 'end')
        .style('alignment-baseline', 'middle')
        .style('font-size', '11px')
        .style('fill', '#9ca3af')
        .style('font-family', 'Inter, sans-serif');
      
      return svg;
    } catch (error) {
      console.error('Error creating performance heatmap:', error);
      return null;
    }
  }

  // Advanced Portfolio Pie Chart
  createPortfolioChart(elementId, portfolioData, options = {}) {
    try {
      const element = document.getElementById(elementId);
      if (!element) {
        console.error(`Element ${elementId} not found`);
        return null;
      }

      element.innerHTML = '';
      
      const data = portfolioData.map(item => item.value);
      const labels = portfolioData.map(item => item.symbol);
      const colors = this.generateColorPalette(data.length);
      
      const chartOptions = {
        series: data,
        chart: {
          width: '100%',
          height: 300,
          type: 'donut',
          background: 'transparent'
        },
        labels: labels,
        colors: colors,
        plotOptions: {
          pie: {
            startAngle: -90,
            endAngle: 270,
            donut: {
              size: '65%',
              labels: {
                show: true,
                name: {
                  show: true,
                  color: '#e2e8f0',
                  fontSize: '14px',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 600
                },
                value: {
                  show: true,
                  color: '#ffffff',
                  fontSize: '18px',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 700,
                  formatter: function (val) {
                    return '$' + parseInt(val).toLocaleString();
                  }
                },
                total: {
                  show: true,
                  showAlways: false,
                  label: 'Total',
                  color: '#e2e8f0',
                  fontSize: '14px',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 600,
                  formatter: function (w) {
                    return '$' + w.globals.seriesTotals.reduce((a, b) => a + b, 0).toLocaleString();
                  }
                }
              }
            }
          }
        },
        dataLabels: {
          enabled: true,
          formatter: function (val, opts) {
            const name = opts.w.globals.labels[opts.seriesIndex];
            return [name, val.toFixed(1) + '%'];
          },
          style: {
            fontSize: '11px',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 500,
            colors: ['#ffffff']
          },
          dropShadow: {
            enabled: true,
            top: 1,
            left: 1,
            blur: 1,
            color: '#000',
            opacity: 0.45
          }
        },
        stroke: {
          show: true,
          curve: 'smooth',
          lineCap: 'butt',
          colors: ['rgba(255,255,255,0.1)'],
          width: 2
        },
        legend: {
          show: true,
          position: 'bottom',
          fontSize: '12px',
          fontFamily: 'Inter, sans-serif',
          fontWeight: 500,
          labels: {
            colors: '#e2e8f0'
          },
          markers: {
            width: 12,
            height: 12,
            radius: 6
          }
        },
        responsive: [{
          breakpoint: 480,
          options: {
            chart: {
              width: 200
            },
            legend: {
              position: 'bottom'
            }
          }
        }],
        theme: {
          mode: 'dark'
        },
        ...options
      };

      const chart = new ApexCharts(element, chartOptions);
      chart.render();
      
      return chart;
    } catch (error) {
      console.error('Error creating portfolio chart:', error);
      return null;
    }
  }

  // Update Key Metrics Display
  updateMetrics(metrics) {
    try {
      const elements = {
        currentPrice: document.getElementById('current-price'),
        priceChange: document.getElementById('price-change'),
        volume: document.getElementById('volume'),
        marketCap: document.getElementById('market-cap')
      };

      if (elements.currentPrice && metrics.currentPrice) {
        elements.currentPrice.textContent = `$${parseFloat(metrics.currentPrice).toFixed(2)}`;
      }

      if (elements.priceChange && metrics.change !== undefined) {
        const change = parseFloat(metrics.change);
        const changePercent = change >= 0 ? '+' + change.toFixed(2) : change.toFixed(2);
        elements.priceChange.textContent = `${changePercent}%`;
        elements.priceChange.className = `metric-value ${change >= 0 ? 'text-green-400' : 'text-red-400'}`;
      }

      if (elements.volume && metrics.volume) {
        elements.volume.textContent = this.formatVolume(metrics.volume);
      }

      if (elements.marketCap && metrics.marketCap) {
        elements.marketCap.textContent = this.formatMarketCap(metrics.marketCap);
      }
    } catch (error) {
      console.error('Error updating metrics:', error);
    }
  }

  // Update Technical Indicators Display
  updateTechnicalIndicators(indicators) {
    try {
      const container = document.getElementById('technical-indicators');
      if (!container) return;

      const indicatorsHTML = [
        {
          name: 'RSI',
          value: indicators.rsi,
          format: (val) => val ? val.toFixed(2) : 'N/A',
          getColor: (val) => {
            if (!val) return 'text-gray-400';
            if (val <= 30) return 'text-green-400'; // Oversold
            if (val >= 70) return 'text-red-400';   // Overbought
            return 'text-yellow-400'; // Neutral
          },
          getSignal: (val) => {
            if (!val) return 'N/A';
            if (val <= 30) return 'Buy Signal';
            if (val >= 70) return 'Sell Signal';
            return 'Neutral';
          }
        },
        {
          name: 'SMA 20',
          value: indicators.sma20,
          format: (val) => val ? `$${val.toFixed(2)}` : 'N/A',
          getColor: (val) => {
            if (!val || !indicators.currentPrice) return 'text-gray-400';
            return indicators.currentPrice > val ? 'text-green-400' : 'text-red-400';
          },
          getSignal: (val) => {
            if (!val || !indicators.currentPrice) return 'N/A';
            return indicators.currentPrice > val ? 'Above SMA' : 'Below SMA';
          }
        },
        {
          name: 'EMA 50',
          value: indicators.ema50,
          format: (val) => val ? `$${val.toFixed(2)}` : 'N/A',
          getColor: (val) => {
            if (!val || !indicators.currentPrice) return 'text-gray-400';
            return indicators.currentPrice > val ? 'text-green-400' : 'text-red-400';
          },
          getSignal: (val) => {
            if (!val || !indicators.currentPrice) return 'N/A';
            return indicators.currentPrice > val ? 'Above EMA' : 'Below EMA';
          }
        },
        {
          name: 'MACD',
          value: indicators.macd,
          format: (val) => val ? val.toFixed(4) : 'N/A',
          getColor: (val) => {
            if (!val) return 'text-gray-400';
            return val > 0 ? 'text-green-400' : 'text-red-400';
          },
          getSignal: (val) => {
            if (!val) return 'N/A';
            return val > 0 ? 'Bullish' : 'Bearish';
          }
        }
      ];

      container.innerHTML = indicatorsHTML.map(indicator => `
        <div class="flex justify-between items-center p-3 rounded-lg bg-gray-800 bg-opacity-30">
          <div class="flex items-center space-x-3">
            <div class="w-3 h-3 rounded-full ${indicator.getColor(indicator.value)}"></div>
            <span class="text-sm font-medium text-gray-300">${indicator.name}</span>
          </div>
          <div class="text-right">
            <div class="text-sm font-semibold ${indicator.getColor(indicator.value)}">
              ${indicator.format(indicator.value)}
            </div>
            <div class="text-xs text-gray-500">
              ${indicator.getSignal(indicator.value)}
            </div>
          </div>
        </div>
      `).join('');
    } catch (error) {
      console.error('Error updating technical indicators:', error);
    }
  }

  // Utility Methods
  processPriceData(rawData) {
    if (!Array.isArray(rawData) || rawData.length === 0) {
      return { labels: [], prices: [], volumes: [] };
    }

    const labels = [];
    const prices = [];
    const volumes = [];

    rawData.forEach(item => {
      labels.push(new Date(item.date || item.timestamp));
      prices.push(parseFloat(item.close || item.price || 0));
      if (item.volume) {
        volumes.push(parseInt(item.volume));
      }
    });

    return { labels, prices, volumes };
  }

  processVolumeData(rawData) {
    if (!Array.isArray(rawData) || rawData.length === 0) {
      return { labels: [], volumes: [], colors: [], borderColors: [], trends: [] };
    }

    const labels = [];
    const volumes = [];
    const colors = [];
    const borderColors = [];
    const trends = [];

    rawData.forEach((item, index) => {
      labels.push(new Date(item.date || item.timestamp));
      volumes.push(parseInt(item.volume || 0));
      
      // Determine trend based on price change
      const currentPrice = parseFloat(item.close || item.price || 0);
      const prevPrice = index > 0 ? parseFloat(rawData[index - 1].close || rawData[index - 1].price || 0) : currentPrice;
      
      let trend = 'neutral';
      let color = this.colors.primary;
      let borderColor = this.colors.primary;
      
      if (currentPrice > prevPrice) {
        trend = 'up';
        color = this.colors.success;
        borderColor = this.colors.success;
      } else if (currentPrice < prevPrice) {
        trend = 'down';
        color = this.colors.danger;
        borderColor = this.colors.danger;
      }
      
      trends.push(trend);
      colors.push(color + '80'); // Add transparency
      borderColors.push(borderColor);
    });

    return { labels, volumes, colors, borderColors, trends };
  }

  createGradient(ctx, colors, direction = 'vertical') {
    let gradient;
    if (direction === 'vertical') {
      gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    } else {
      gradient = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
    }
    
    gradient.addColorStop(0, colors[0] + '80');
    gradient.addColorStop(1, colors[1] + '20');
    return gradient;
  }

  createPriceAnnotations(data) {
    const annotations = [];
    
    if (data.prices && data.prices.length > 0) {
      const maxPrice = Math.max(...data.prices);
      const minPrice = Math.min(...data.prices);
      const maxIndex = data.prices.indexOf(maxPrice);
      const minIndex = data.prices.indexOf(minPrice);
      
      // Add high point annotation
      annotations.push({
        type: 'point',
        xValue: data.labels[maxIndex],
        yValue: maxPrice,
        backgroundColor: this.colors.success,
        borderColor: this.colors.success,
        borderWidth: 2,
        radius: 4,
        label: {
          content: `High: $${maxPrice.toFixed(2)}`,
          enabled: true,
          position: 'top'
        }
      });
      
      // Add low point annotation
      annotations.push({
        type: 'point',
        xValue: data.labels[minIndex],
        yValue: minPrice,
        backgroundColor: this.colors.danger,
        borderColor: this.colors.danger,
        borderWidth: 2,
        radius: 4,
        label: {
          content: `Low: $${minPrice.toFixed(2)}`,
          enabled: true,
          position: 'bottom'
        }
      });
    }
    
    return annotations;
  }

  generateColorPalette(count) {
    const baseColors = [
      this.colors.primary,
      this.colors.secondary,
      this.colors.accent,
      this.colors.warning,
      this.colors.success,
      '#9333ea', // purple
      '#0ea5e9', // sky
      '#f59e0b', // amber
      '#10b981', // emerald
      '#ef4444'  // red
    ];
    
    const colors = [];
    for (let i = 0; i < count; i++) {
      colors.push(baseColors[i % baseColors.length]);
    }
    
    return colors;
  }

  generateSampleHeatmapData() {
    const rows = ['Tech', 'Healthcare', 'Finance', 'Energy', 'Consumer'];
    const columns = ['1D', '1W', '1M', '3M', '1Y'];
    const data = [];
    
    rows.forEach(row => {
      columns.forEach(column => {
        data.push({
          row: row,
          column: column,
          value: (Math.random() - 0.5) * 20 // -10% to +10%
        });
      });
    });
    
    return {
      rows: rows,
      columns: columns,
      data: data,
      values: data.map(d => d.value)
    };
  }

  formatVolume(volume) {
    if (!volume || isNaN(volume)) return '0';
    
    if (volume >= 1e9) {
      return (volume / 1e9).toFixed(2) + 'B';
    } else if (volume >= 1e6) {
      return (volume / 1e6).toFixed(2) + 'M';
    } else if (volume >= 1e3) {
      return (volume / 1e3).toFixed(2) + 'K';
    }
    
    return volume.toLocaleString();
  }

  formatMarketCap(marketCap) {
    if (!marketCap || isNaN(marketCap)) return '$0';
    
    if (marketCap >= 1e12) {
      return '$' + (marketCap / 1e12).toFixed(2) + 'T';
    } else if (marketCap >= 1e9) {
      return '$' + (marketCap / 1e9).toFixed(2) + 'B';
    } else if (marketCap >= 1e6) {
      return '$' + (marketCap / 1e6).toFixed(2) + 'M';
    }
    
    return '$' + marketCap.toLocaleString();
  }

  addChartAnimations(chart) {
    // Add subtle animations for real-time feel
    if (chart && chart.options) {
      chart.options.animation = {
        duration: 1000,
        easing: 'easeOutCubic'
      };
    }
  }

  // Cleanup method
  destroy() {
    this.charts.forEach((chart, key) => {
      try {
        chart.destroy();
      } catch (error) {
        console.warn(`Failed to destroy chart ${key}:`, error);
      }
    });
    this.charts.clear();
    
    // Clean up D3 tooltips
    d3.selectAll('.heatmap-tooltip').remove();
  }

  // Get chart instance
  getChart(elementId) {
    return this.charts.get(elementId);
  }

  // Update chart data
  updateChart(elementId, newData) {
    const chart = this.charts.get(elementId);
    if (chart && chart.data) {
      chart.data = newData;
      chart.update();
    }
  }
}

// Create and export global instance
const stockVisualizations = new StockVisualizationEngine();
window.stockVisualizations = stockVisualizations;

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StockVisualizationEngine;
}

export default StockVisualizationEngine;