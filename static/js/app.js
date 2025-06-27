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
                        const serverName = detailServerName.textContent;
                        populateDetailView(serverName);
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
        if (serverReport) {
            cpuChart = createChart(cpuChartCanvas, 'bar', [serverReport.cpuUsage.toFixed(2)]);
            memChart = createChart(memChartCanvas, 'bar', [serverReport.memUsedMB]);
            
            detailInfoContent.innerHTML += `
                <hr>
                <p><strong>Status:</strong> ${serverReport.isOnline ? 'Online' : 'Offline'}</p>
                <p><strong>CPU Usage:</strong> ${serverReport.cpuUsage.toFixed(2)} %</p>
                <p><strong>Memory:</strong> ${serverReport.memUsedMB} MB Used / ${serverReport.memTotalMB} MB Total</p>
                <p><strong>Top Processes:</strong><pre>${serverReport.topProcesses}</pre></p>
            `;
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

    function createChart(canvasEl, type, data) {
        return new Chart(canvasEl, {
            type: type,
            data: { 
                labels: [''], // Single blank label
                datasets: [{ 
                    data: data, 
                    backgroundColor: canvasEl.id === 'cpuChart' ? 'rgba(62, 123, 225, 0.6)' : 'rgba(76, 175, 80, 0.6)',
                    borderColor: canvasEl.id === 'cpuChart' ? 'rgba(62, 123, 225, 1)' : 'rgba(76, 175, 80, 1)',
                    borderWidth: 1
                }] 
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: true,
                scales: { y: { beginAtZero: true } },
                plugins: { legend: { display: false } }
            }
        });
    }

    // --- Initial Load ---
    initializeDashboard();
    connectWebSocket();
});