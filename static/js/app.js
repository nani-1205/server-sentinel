document.addEventListener('DOMContentLoaded', () => {
    const runBtn = document.getElementById('run-manual-btn');
    const logsEl = document.getElementById('logs');
    const tableBody = document.querySelector('#detailsTable tbody');

    let cpuChart, memChart;

    // --- WebSocket ---
    let socket;
    function connectWebSocket() {
        socket = new WebSocket(`ws://${window.location.host}/ws/run`);

        socket.onopen = () => {
            logMessage('WebSocket connection established.', 'success');
            runBtn.disabled = false;
        };

        socket.onmessage = (event) => {
            const msg = event.data;
            if (msg.includes('✅') || msg.includes('🚀') || msg.includes('🏁')) {
                logMessage(msg, 'success');
            } else if (msg.includes('⚠️')) {
                logMessage(msg, 'warn');
            } else if (msg.includes('❌')) {
                logMessage(msg, 'error');
            } else {
                logMessage(msg, 'info');
            }

            if(msg.includes('🏁 Process complete.')) {
                fetchLatestReport();
                runBtn.disabled = false; // Re-enable button
            }
        };

        socket.onclose = () => {
            logMessage('WebSocket connection closed. Reconnecting...', 'warn');
            runBtn.disabled = true;
            setTimeout(connectWebSocket, 3000); // Try to reconnect every 3 seconds
        };

        socket.onerror = (error) => {
            logMessage(`WebSocket error: ${error.message}`, 'error');
            runBtn.disabled = true;
        };
    }

    function logMessage(message, type = 'info') {
        const span = document.createElement('span');
        span.className = type;
        span.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logsEl.appendChild(span);
        logsEl.scrollTop = logsEl.scrollHeight;
    }

    runBtn.addEventListener('click', () => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            logsEl.innerHTML = ''; // Clear previous logs
            socket.send("start-run");
            logMessage('Manual check initiated...', 'info');
            runBtn.disabled = true; // Disable button during run
        } else {
            logMessage('WebSocket is not connected. Please wait.', 'error');
        }
    });


    // --- Chart and Table Logic ---
    async function fetchLatestReport() {
        try {
            const response = await fetch('/api/latest-report');
            if (!response.ok) {
                const errorText = await response.text();
                logMessage(`Failed to fetch report: ${errorText}`, 'error');
                return;
            }
            const data = await response.json();
            updateDashboard(data);
        } catch (error)
        {
            logMessage(`Error fetching report: ${error.message}`, 'error');
        }
    }

    function updateDashboard(data) {
        if (!data || data.length === 0) return;

        const labels = data.map(s => s.ServerName);
        
        // CPU Chart
        const cpuData = data.map(s => s.CPUUsage.toFixed(2));
        if (cpuChart) cpuChart.destroy();
        cpuChart = createChart('cpuChart', 'bar', labels, 'CPU Usage %', cpuData, 'rgba(63, 114, 175, 0.6)');

        // Memory Chart
        const memUsedData = data.map(s => s.MemUsedMB);
        if (memChart) memChart.destroy();
        memChart = createChart('memChart', 'bar', labels, 'Memory Used (MB)', memUsedData, 'rgba(76, 175, 80, 0.6)');
        
        // Update Table
        tableBody.innerHTML = ''; // Clear existing rows
        data.forEach(server => {
            const row = tableBody.insertRow();
            const status = server.IsOnline ? 'Online' : 'Offline';
            const statusClass = server.IsOnline ? 'status-online' : 'status-offline';
            row.innerHTML = `
                <td>${server.ServerName}</td>
                <td><span class="${statusClass}">${status}</span></td>
                <td>${server.CPUUsage.toFixed(2)}</td>
                <td>${server.MemUsedMB} MB</td>
                <td>${server.MemFreeMB} MB</td>
                <td><pre>${server.TopProcesses.split('\n').slice(1).join('\n')}</pre></td>
            `;
        });
    }

    function createChart(canvasId, type, labels, label, data, color) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        return new Chart(ctx, {
            type: type,
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: data,
                    backgroundColor: color,
                    borderColor: color.replace('0.6', '1'),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                // --- FIX FOR RESIZE LOOP ---
                // This tells Chart.js not to listen for resize events after the initial draw.
                onResize: null,
                // --- END FIX ---
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: 'rgba(255,255,255,0.7)' },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    },
                    x: {
                        ticks: { color: 'rgba(255,255,255,0.7)' },
                        grid: { color: 'rgba(255,255,255,0.1)' }
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

    // Initial Load
    connectWebSocket();
    fetchLatestReport();
});