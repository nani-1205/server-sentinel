document.addEventListener('DOMContentLoaded', () => {
    // --- Element Cache ---
    const themeToggle = document.getElementById('theme-toggle');
    const dashboardView = document.getElementById('dashboard-view');
    const detailView = document.getElementById('detail-view');
    const serverCardsContainer = document.getElementById('server-cards-container');
    const logsEl = document.getElementById('logs');
    const logWidgetBtn = document.getElementById('log-widget-btn');
    const logWindow = document.getElementById('log-window');
    const logCloseBtn = document.getElementById('log-close-btn');
    const runAllBtn = document.getElementById('run-all-btn');
    const runSelectedBtn = document.getElementById('run-selected-btn');
    const runSingleBtn = document.getElementById('run-single-btn');
    const backToDashboardBtn = document.getElementById('back-to-dashboard-btn');
    const detailServerName = document.getElementById('detail-server-name');
    const detailInfoContent = document.getElementById('detail-info-content');
    const cpuChartCanvas = document.getElementById('cpuChart');
    const memChartCanvas = document.getElementById('memChart');

    let cpuChart, memChart;
    let servers = [];
    let latestReportData = [];
    let socket;

    // --- Theme Manager ---
    const setTheme = (isLight) => {
        document.body.classList.toggle('light-mode', isLight);
        themeToggle.checked = isLight;
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        // We need to redraw charts on theme change because grid/tick colors change
        if (detailView.classList.contains('active')) {
             populateDetailView(detailServerName.textContent);
        }
    };
    const savedTheme = localStorage.getItem('theme') === 'light';
    setTheme(savedTheme);
    themeToggle.addEventListener('change', () => setTheme(themeToggle.checked));

    // --- View Manager ---
    const showView = (viewId) => {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
    };

    // --- WebSocket ---
    const connectWebSocket = () => {
        socket = new WebSocket(`ws://${window.location.host}/ws/run`);
        socket.onopen = () => logMessage('✅ WebSocket connection established.');
        socket.onclose = () => {
            logMessage('⚠️ WebSocket connection closed. Reconnecting...');
            setTimeout(connectWebSocket, 3000);
        };
        socket.onmessage = (event) => {
            const msg = event.data;
            logMessage(msg);
            if (msg.includes('🏁 Process complete.')) {
                enableAllButtons();
                fetchLatestReport().then(() => {
                    if (detailView.classList.contains('active')) {
                        populateDetailView(detailServerName.textContent);
                    }
                });
            }
        };
    };

    // --- Event Listeners ---
    runAllBtn.addEventListener('click', () => runChecks(['all']));
    runSelectedBtn.addEventListener('click', () => {
        const selectedServers = Array.from(document.querySelectorAll('.server-card-checkbox:checked')).map(cb => cb.dataset.serverName);
        if (selectedServers.length > 0) runChecks(selectedServers);
        else alert('No servers selected.');
    });
    runSingleBtn.addEventListener('click', () => {
        const serverName = runSingleBtn.dataset.serverName;
        if (serverName) runChecks([serverName]);
    });
    backToDashboardBtn.addEventListener('click', () => showView('dashboard-view'));
    logWidgetBtn.addEventListener('click', () => logWindow.classList.toggle('visible'));
    logCloseBtn.addEventListener('click', () => logWindow.classList.remove('visible'));

    // --- Core Functions ---
    const runChecks = (serverList) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ action: 'run', servers: serverList }));
            disableAllButtons();
        } else {
            alert('WebSocket is not connected.');
        }
    };
    
    const disableAllButtons = () => [runAllBtn, runSelectedBtn, runSingleBtn].forEach(btn => btn.disabled = true);
    const enableAllButtons = () => [runAllBtn, runSelectedBtn, runSingleBtn].forEach(btn => btn.disabled = false);
    const logMessage = (message) => logsEl.prepend(`[${new Date().toLocaleTimeString()}] ${message}\n`);

    const renderServerCard = (server) => `
        <div class="card server-card" data-server-name="${server.name}">
            <div class="card-header"><h3>${server.name}</h3></div>
            <div class="card-body">
                <p><strong>Host:</strong> ${server.host}</p>
                <p><strong>User:</strong> ${server.user}</p>
            </div>
            <div class="card-footer">
                <input type="checkbox" class="server-card-checkbox" data-server-name="${server.name}">
                <label class="card-status">Awaiting task...</label>
            </div>
        </div>`;

    const populateDetailView = (serverName) => {
        showView('detail-view');
        const server = servers.find(s => s.name === serverName);
        if (!server) return;

        detailServerName.textContent = server.name;
        detailInfoContent.innerHTML = `<p><strong>Host:</strong> ${server.host}:${server.port}</p><p><strong>User:</strong> ${server.user}</p>`;
        runSingleBtn.dataset.serverName = server.name;

        if (cpuChart) cpuChart.destroy();
        if (memChart) memChart.destroy();
        
        const serverReport = latestReportData.find(r => r.serverName === serverName);
        
        // Clear old detailed metrics
        const oldMetrics = detailInfoContent.querySelector('.detailed-metrics');
        if (oldMetrics) oldMetrics.remove();

        if (serverReport) {
            cpuChart = createChart(cpuChartCanvas, 'CPU', [serverReport.cpuUsage.toFixed(2)], '%');
            memChart = createChart(memChartCanvas, 'Memory', [serverReport.memUsedMB], 'MB');
            
            const metricsDiv = document.createElement('div');
            metricsDiv.className = 'detailed-metrics';
            metricsDiv.innerHTML = `
                <hr>
                <p><strong>Status:</strong> ${serverReport.isOnline ? 'Online' : 'Offline'}</p>
                <p><strong>CPU Usage:</strong> ${serverReport.cpuUsage.toFixed(2)} %</p>
                <p><strong>Memory:</strong> ${serverReport.memUsedMB} MB Used / ${serverReport.memTotalMB} MB Total</p>
                <p><strong>Top Processes:</strong><pre>${serverReport.topProcesses}</pre></p>
            `;
            detailInfoContent.appendChild(metricsDiv);
        } else {
            // Show a "no data" message in the chart area
            cpuChartCanvas.parentElement.innerHTML += '<div class="no-data-message">No data available. Run a health check.</div>';
            memChartCanvas.parentElement.innerHTML += '<div class="no-data-message">No data available. Run a health check.</div>';
        }
    };
    
    const fetchLatestReport = async () => {
        try {
            const response = await fetch('/api/latest-report');
            if (response.ok) latestReportData = await response.json();
            else latestReportData = [];
        } catch (error) {
            console.error('Failed to fetch latest report:', error);
            latestReportData = [];
        }
    };

    const initializeDashboard = async () => {
        try {
            await fetchLatestReport();
            const response = await fetch('/api/servers');
            servers = await response.json();
            
            serverCardsContainer.innerHTML = servers.map(renderServerCard).join('');
            document.querySelectorAll('.server-card').forEach(card => {
                card.addEventListener('click', e => {
                    if (e.target.type === 'checkbox') return;
                    populateDetailView(card.dataset.serverName);
                });
            });
        } catch (error) {
            console.error('Failed to initialize dashboard:', error);
        }
    };

    function createGradient(ctx, area, isCpu) {
        const isLightMode = document.body.classList.contains('light-mode');
        const color1 = isCpu ? '#3a7bd5' : '#3ddc84';
        const color2 = isCpu ? '#00d2ff' : '#00a9e0';
        const gradient = ctx.createLinearGradient(0, area.bottom, 0, area.top);
        gradient.addColorStop(0, color1);
        gradient.addColorStop(1, color2);
        return gradient;
    }

    function createChart(canvasEl, label, data, unit) {
        const ctx = canvasEl.getContext('2d');
        const isLightMode = document.body.classList.contains('light-mode');
        const gridColor = isLightMode ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';
        const textColor = isLightMode ? '#333' : '#ccc';

        return new Chart(ctx, {
            type: 'bar',
            data: { 
                labels: [label],
                datasets: [{ 
                    label: `${label} Usage`,
                    data: data, 
                    backgroundColor: (context) => createGradient(context.chart.ctx, context.chart.chartArea, label === 'CPU'),
                    borderColor: 'rgba(255, 255, 255, 0.25)',
                    borderWidth: 1,
                    borderRadius: 5,
                    borderSkipped: false,
                    barPercentage: 0.5,
                    categoryPercentage: 0.8
                }] 
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 1000, easing: 'easeOutQuart' },
                scales: { 
                    y: { 
                        beginAtZero: true,
                        grid: { color: gridColor, drawBorder: false },
                        ticks: {
                            color: textColor,
                            padding: 10,
                            callback: function(value) { return value + ` ${unit}`; }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor, font: { size: 14, weight: '600' } }
                    }
                },
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 12 },
                        padding: 10,
                        cornerRadius: 4,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.raw} ${unit}`;
                            }
                        }
                    }
                },
                onHover: (event, chartElement) => {
                    event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
                }
            }
        });
    }

    // --- Initial Load ---
    initializeDashboard();
    connectWebSocket();
});