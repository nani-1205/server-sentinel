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
    let serverData = {};
    let socket;

    // --- Theme Manager ---
    const setTema = (isLight) => {
        document.body.classList.toggle('light-mode', isLight);
        themeToggle.checked = isLight;
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
    };
    const savedTheme = localStorage.getItem('theme') === 'light';
    setTema(savedTheme);
    themeToggle.addEventListener('change', () => setTema(themeToggle.checked));

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

            // Dynamically update server card if possible
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
    backToDashboard-btn.addEventListener('click', () => showView('dashboard-view'));
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

    const logMessage = (message, type = 'info') => {
        const span = document.createElement('span');
        span.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logsEl.prepend(span);
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

    const populateDetailView = (serverName) => {
        const server = servers.find(s => s.name === serverName);
        if (!server) return;
        
        detailServerName.textContent = server.name;
        detailInfoContent.innerHTML = `
            <p><strong>Host:</strong> ${server.host}:${server.port}</p>
            <p><strong>User:</strong> ${server.user}</p>
        `;
        runSingleBtn.dataset.serverName = server.name;

        // You would fetch and display specific data/charts for this server here
        // For now, let's just show the view
        showView('detail-view');
    };

    const initializeDashboard = async () => {
        try {
            const response = await fetch('/api/servers');
            servers = await response.json();
            
            serverCardsContainer.innerHTML = '';
            servers.forEach(server => {
                serverCardsContainer.innerHTML += renderServerCard(server);
            });

            // Add event listeners to newly created cards
            document.querySelectorAll('.server-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    // Prevent navigation when clicking the checkbox
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