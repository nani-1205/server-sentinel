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

    let cpuChart, memChart;
    let servers = [];
    let latestReportData = []; // Store the full report data
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
        socket.onopen = () => logMessage('✅ WebSocket connection established.', 'success');
        socket.onclose = () => {
            logMessage('⚠️ WebSocket connection closed. Reconnecting...', 'warn');
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
                fetchLatestReport().then(() => {
                    // If we are on a detail page, refresh its data
                    if (detailView.classList.contains('active')) {
                        const serverName = detailServerName.textContent;
                        populateDetailView(serverName, true); // force data refresh
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
    logToggleBtn.addEventListener('click', () => logPanel.classList.toggle('collapsed'));

    // --- Core Functions ---
    const runChecks = (serverList) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            const message = { action: 'run', servers: serverList };
            socket.send(JSON.stringify(message));
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

    const populateDetailView = (serverName, forceDataRefresh = false) => {
        const server = servers.find(s => s.name === serverName);
        if (!server) return;

        detailServerName.textContent = server.name;
        detailInfoContent.innerHTML = `<p><strong>Host:</strong> ${server.host}:${server.port}</p><p><strong>User:</strong> ${server.user}</p>`;
        runSingleBtn.dataset.serverName = server.name;

        // Find the data for this specific server from the last report
        const serverReport = latestReportData.find(r => r.ServerName === serverName);
        if (serverReport) {
            // Update CPU Chart
            if (cpuChart) cpuChart.destroy();
            cpuChart = createChart('cpuChart', 'bar', [serverReport.ServerName], 'CPU Usage %', [serverReport.CPUUsage.toFixed(2)], 'rgba(62, 123, 225, 0.6)');
            
            // Update Memory Chart
            if (memChart) memChart.destroy();
            memChart = createChart('memChart', 'bar', [serverReport.ServerName], 'Memory Used (MB)', [serverReport.MemUsedMB], 'rgba(76, 175, 80, 0.6)');

            // Add detailed metrics to the info box
            detailInfoContent.innerHTML += `
                <hr>
                <p><strong>Status:</strong> ${serverReport.IsOnline ? 'Online' : 'Offline'}</p>
                <p><strong>CPU Usage:</strong> ${serverReport.CPUUsage.toFixed(2)} %</p>
                <p><strong>Memory:</strong> ${serverReport.MemUsedMB} MB Used / ${serverReport.MemTotalMB} MB Total</p>
                <p><strong>Top Processes:</strong><pre>${serverReport.TopProcesses}</pre></p>
            `;
        }

        showView('detail-view');
    };
    
    const fetchLatestReport = async () => {
        try {
            const response = await fetch('/api/latest-report');
            if (response.ok) latestReportData = await response.json();
        } catch (error) {
            console.error('Failed to fetch latest report:', error);
        }
    };

    const initializeDashboard = async () => {
        try {
            await fetchLatestReport(); // Get any existing data on load
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

    function createChart(canvasId, type, labels, label, data, color) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        return new Chart(ctx, {
            type: type,
            data: {
                labels: labels,
                datasets: [{ label: label, data: data, backgroundColor: color }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onResize: null,
                scales: { y: { beginAtZero: true } },
                plugins: { legend: { display: false } }
            }
        });
    }

    // --- Initial Load ---
    initializeDashboard();
    connectWebSocket();
});