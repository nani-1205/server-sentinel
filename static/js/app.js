document.addEventListener('DOMContentLoaded', () => {
    // --- Element Cache ---
    const themeToggle = document.getElementById('theme-toggle');
    const dashboardView = document.getElementById('dashboard-view');
    const detailView = document.getElementById('detail-view');
    const serverCardsContainer = document.getElementById('server-cards-container');
    const logsEl = document.getElementById('logs');
    const logPanel = document.querySelector('.log-panel');
    const logToggleBtn = document.getElementById('log-toggle-btn');
    const runAllBtn = document.getElementById('run-all-btn');
    const runSelectedBtn = document.getElementById('run-selected-btn');
    const runSingleBtn = document.getElementById('run-single-btn');
    const backToDashboardBtn = document.getElementById('back-to-dashboard-btn');
    const detailServerName = document.getElementById('detail-server-name');
    const detailInfoContent = document.getElementById('detail-info-content');
    const detailMetricsContent = document.getElementById('detail-metrics-content');
    const cpuChartCanvas = document.getElementById('cpuChart');
    const memChartCanvas = document.getElementById('memChart');

    let cpuChart, memChart;
    let servers = [];
    let socket;

    // --- Theme Manager ---
    const setTheme = (isLight) => {
        document.body.classList.toggle('light-mode', isLight);
        themeToggle.checked = isLight;
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
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

            const match = msg.match(/\[(.*?)\]/);
            if (match && match[1]) {
                const serverName = match[1];
                const card = document.querySelector(`.server-card[data-server-name="${serverName}"]`);
                if (card) {
                    const statusEl = card.querySelector('.card-status');
                    statusEl.textContent = msg.split(']').pop().trim();
                }
            }
            if (msg.includes('🏁 Process complete.')) {
                enableAllButtons();
                fetchAndRenderLatestReport(); // Trigger data rendering on completion
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
    logToggleBtn.addEventListener('click', () => logPanel.classList.toggle('collapsed'));

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
    const logMessage = (message) => {
        const span = document.createElement('span');
        span.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logsEl.prepend(span);
    };

    // --- Data Fetching and Rendering ---
    const fetchAndRenderLatestReport = async () => {
        try {
            const response = await fetch('/api/latest-report');
            const reports = await response.json();
            if (reports && reports.length > 0) {
                if (detailView.classList.contains('active')) {
                    const currentServerName = detailServerName.textContent;
                    const reportForThisServer = reports.find(r => r.ServerName === currentServerName);
                    if (reportForThisServer) {
                        updateDetailViewWithData(reportForThisServer);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to fetch or render report:', error);
        }
    };
    
    const updateDetailViewWithData = (report) => {
        // Update Charts
        if (cpuChart) cpuChart.destroy();
        cpuChart = createChart(cpuChartCanvas, 'bar', [report.ServerName], 'CPU Usage %', [report.CPUUsage.toFixed(2)], 'rgba(98, 0, 238, 0.6)');

        if (memChart) memChart.destroy();
        memChart = createChart(memChartCanvas, 'bar', [report.ServerName], 'Memory Used (MB)', [report.MemUsedMB], 'rgba(1, 135, 134, 0.6)');

        // Update Metrics Table
        detailMetricsContent.innerHTML = `
            <table class="detail-metrics-table">
                <tr><th>Status</th><td>${report.IsOnline ? '✅ Online' : '❌ Offline'}</td></tr>
                <tr><th>Cache Cleared</th><td>${report.CacheCleared ? '✅ Yes' : '❌ No'}</td></tr>
                <tr><th>CPU Usage</th><td>${report.CPUUsage.toFixed(2)} %</td></tr>
                <tr><th>Memory Total</th><td>${report.MemTotalMB} MB</td></tr>
                <tr><th>Memory Used</th><td>${report.MemUsedMB} MB</td></tr>
                <tr><th>Memory Free</th><td>${report.MemFreeMB} MB</td></tr>
                <tr><th>Swap Used</th><td>${report.SwapUsedMB} / ${report.SwapTotalMB} MB</td></tr>
                <tr><th>Top Processes</th><td><pre>${report.TopProcesses}</pre></td></tr>
            </table>
        `;
    };

    const renderServerCard = (server) => `
        <div class="card server-card" data-server-name="${server.Name}">
            <div class="card-header"><h3>${server.Name}</h3><div class="status online"><div class="status-dot"></div><span>Online</span></div></div>
            <div class="card-body"><p><strong>Host:</strong> ${server.Host}</p><p><strong>User:</strong> ${server.User}</p></div>
            <div class="card-footer"><input type="checkbox" class="server-card-checkbox" data-server-name="${server.Name}"><label class="card-status">Awaiting task...</label></div>
        </div>
    `;

    const populateDetailView = (serverName) => {
        const server = servers.find(s => s.Name === serverName);
        if (!server) return;
        
        detailServerName.textContent = server.Name;
        runSingleBtn.dataset.serverName = server.Name;
        detailInfoContent.innerHTML = `<p><strong>Host:</strong> ${server.Host}:${server.Port}</p><p><strong>User:</strong> ${server.User}</p>`;
        
        if (cpuChart) cpuChart.destroy();
        if (memChart) memChart.destroy();
        detailMetricsContent.innerHTML = '<p>Run a health check to see detailed metrics.</p>';

        showView('detail-view');
    };

    const initializeDashboard = async () => {
        try {
            const response = await fetch('/api/servers');
            if (!response.ok) throw new Error(`Failed to fetch server list: ${response.statusText}`);
            servers = await response.json();
            
            serverCardsContainer.innerHTML = servers.map(renderServerCard).join('');

            document.querySelectorAll('.server-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (e.target.type === 'checkbox') return;
                    populateDetailView(card.dataset.serverName);
                });
            });
        } catch (error) {
            console.error(error);
            serverCardsContainer.innerHTML = `<p style="color: red;">Could not load server list. Check console for errors.</p>`;
        }
    };
    
    function createChart(canvas, type, labels, label, data, color) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        return new Chart(ctx, {
            type: type,
            data: { labels: labels, datasets: [{ label: label, data: data, backgroundColor: color,  borderColor: color.replace('0.6', '1'), borderWidth: 1 }] },
            options: {
                responsive: true, maintainAspectRatio: false, onResize: null,
                scales: { 
                    y: { beginAtZero: true, ticks: { color: document.body.classList.contains('light-mode') ? '#000' : '#fff' } },
                    x: { ticks: { color: document.body.classList.contains('light-mode') ? '#000' : '#fff' } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    // --- Initial Load ---
    initializeDashboard();
    connectWebSocket();
});