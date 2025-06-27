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
                // If we are on a detail view, refresh its data
                if(detailView.classList.contains('active')) {
                    const serverName = detailServerName.textContent;
                    populateDetailView(serverName);
                }
            }
        };
    };

    // --- Event Listeners ---
    runAllBtn.addEventListener('click', () => runChecks(['all']));
    runSelectedBtn.addEventListener('click', () => {
        const selectedServers = Array.from(document.querySelectorAll('.server-card-checkbox:checked')).map(cb => cb.dataset.serverName);
        if (selectedServers.length > 0) {
            runChecks(selectedServers);
        } else {
            alert('No servers selected.');
        }
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
    
    const disableAllButtons = () => {
        [runAllBtn, runSelectedBtn, runSingleBtn].forEach(btn => btn.disabled = true);
    };

    const enableAllButtons = () => {
        [runAllBtn, runSelectedBtn, runSingleBtn].forEach(btn => btn.disabled = false);
    };

    const logMessage = (message) => {
        const span = document.createElement('span');
        span.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logsEl.prepend(span); // Use prepend to show newest logs at the top
    };

    const renderServerCard = (server) => {
        return `
            <div class="card server-card" data-server-name="${server.name}">
                <div class="card-header">
                    <h3>${server.name}</h3>
                    <div class="status online">
                        <div class="status-dot"></div>
                        <span>Online</span>
                    </div>
                </div>
                <div class="card-body">
                    <p><strong>Host:</strong> ${server.host}</p>
                    <p><strong>User:</strong> ${server.user}</p>
                </div>
                <div class="card-footer">
                    <input type="checkbox" class="server-card-checkbox" data-server-name="${server.name}">
                    <label class="card-status">Awaiting task...</label>
                </div>
            </div>
        `;
    };

    const populateDetailView = async (serverName) => {
        const server = servers.find(s => s.name === serverName);
        if (!server) return;

        showView('detail-view');

        detailServerName.textContent = server.name;
        runSingleBtn.dataset.serverName = server.name;

        // Clear old data first
        detailInfoContent.innerHTML = `<p><em>Loading data...</em></p>`;
        if(cpuChart) cpuChart.destroy();
        if(memChart) memChart.destroy();

        try {
            const response = await fetch('/api/latest-report');
            if (!response.ok) {
                 detailInfoContent.innerHTML = `
                    <p><strong>Host:</strong> ${server.host}:${server.port}</p>
                    <p><strong>User:</strong> ${server.user}</p>
                    <p><em>No report data available. Run a health check.</em></p>
                `;
                return;
            }

            const reportData = await response.json();
            const serverReport = reportData.find(r => r.ServerName === serverName);

            if (serverReport) {
                const statusClass = serverReport.IsOnline ? 'status-online' : 'status-offline';
                const statusText = serverReport.IsOnline ? 'Online' : 'Offline';
                detailInfoContent.innerHTML = `
                    <p><strong>Host:</strong> ${server.host}:${server.port}</p>
                    <p><strong>User:</strong> ${server.user}</p>
                    <p><strong>Status:</strong> <span class="${statusClass}">${statusText}</span></p>
                    <p><strong>CPU Usage:</strong> ${serverReport.CPUUsage.toFixed(2)}%</p>
                    <p><strong>Memory:</strong> ${serverReport.MemUsedMB} MB / ${serverReport.MemTotalMB} MB Used</p>
                    <p><strong>Swap:</strong> ${serverReport.SwapUsedMB} MB / ${serverReport.SwapTotalMB} MB Used</p>
                `;

                const labels = [serverReport.ServerName];
                const cpuData = [serverReport.CPUUsage.toFixed(2)];
                const memData = [serverReport.MemUsedMB];

                if (cpuChart) cpuChart.destroy();
                cpuChart = createChart('cpuChart', 'bar', labels, 'CPU Usage %', cpuData, 'rgba(99, 102, 241, 0.7)');

                if (memChart) memChart.destroy();
                memChart = createChart('memChart', 'bar', labels, 'Memory Used (MB)', memData, 'rgba(34, 197, 94, 0.7)');
                
            } else {
                 detailInfoContent.innerHTML = `
                    <p><strong>Host:</strong> ${server.host}:${server.port}</p>
                    <p><strong>User:</strong> ${server.user}</p>
                    <p><em>No report data found for this server. Run a health check.</em></p>
                `;
            }

        } catch (error) {
            console.error('Failed to populate detail view:', error);
            detailInfoContent.innerHTML = `<p>Error loading server details.</p>`;
        }
    };

    function createChart(canvasId, type, labels, label, data, color) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        ctx.canvas.parentNode.style.height = '250px';

        return new Chart(ctx, {
            type: type,
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: data,
                    backgroundColor: color,
                    borderColor: color.replace('0.7', '1'),
                    borderWidth: 1,
                    barPercentage: 0.5,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onResize: null,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: 'var(--text-secondary)' },
                        grid: { color: 'var(--border-color)' }
                    },
                    x: {
                        ticks: { color: 'var(--text-secondary)' },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    const initializeDashboard = async () => {
        try {
            const response = await fetch('/api/servers');
            servers = await response.json();
            
            serverCardsContainer.innerHTML = '';
            servers.forEach(server => {
                serverCardsContainer.innerHTML += renderServerCard(server);
            });

            document.querySelectorAll('.server-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (e.target.type === 'checkbox') return;
                    const serverName = card.dataset.serverName;
                    populateDetailView(serverName);
                });
            });
            
        } catch (error) {
            console.error('Failed to fetch server list:', error);
        }
    };

    // --- Initial Load ---
    initializeDashboard();
    connectWebSocket();
});